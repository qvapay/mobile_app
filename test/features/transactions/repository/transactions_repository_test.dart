import 'dart:convert';

import 'package:dartz/dartz.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/core/extensions/extensions.dart';
import 'package:mobile_app/features/transactions/repository/transactions_repository.dart';
import 'package:mobile_app/features/user_data/models/models.dart';
import 'package:mocktail/mocktail.dart';
import 'package:qvapay_api_client/qvapay_api_client.dart';

import '../../../fixtures/fixture_adapter.dart';

class MockQvaPayApi extends Mock implements QvaPayApi {}

void main() {
  late ITransactionsRepository repository;
  late QvaPayApi qvaPayApi;

  setUp(() {
    qvaPayApi = MockQvaPayApi();
    repository = TransactionsRepository(qvaPayApi: qvaPayApi);
  });

  final tMeJson = json.decode(fixture('me.json')) as Map<String, dynamic>;
  final tTransactionsQvaPayList = Me.fromJson(tMeJson).latestTransactions!;

  final tTransactionListJson =
      json.decode(fixture('user_transactions.json')) as List<dynamic>;
  final tUserTransactionListJson =
      tTransactionListJson.cast<Map<String, dynamic>>();
  final tUserTransactionList =
      tUserTransactionListJson.map((t) => UserTransaction.fromJson(t)).toList();

  group('getLatestTransactions', () {
    const tSearchTerm = 'a1073148-880e-4dff-91fc-3c10f7dcc4bb';

    final tFilterList = tTransactionsQvaPayList
        .where((element) => element.uuid == tSearchTerm)
        .toList();
    final tUserFilterList = tFilterList
        .map((transaction) => UserTransaction.fromTransaction(transaction))
        .toList();

    test(
        'should return [Right<List<UserTransaction>>] with '
        'the last [UserTransaction]', () async {
      when(() => qvaPayApi.getTransactions())
          .thenAnswer((_) async => tTransactionsQvaPayList);

      final result = await repository.getLatestTransactions();

      expect(
        result,
        isA<Right<Failure, List<UserTransaction>>>().having(
          (transactions) => transactions.toOption().toNullable(),
          'list of [UserTransaction]',
          equals(tUserTransactionList),
        ),
      );
      verify(() => qvaPayApi.getTransactions()).called(1);
    });

    test(
        'should return [Right<List<UserTransaction>>] depending '
        'on the search parameter `searchTerm`', () async {
      when(() => qvaPayApi.getTransactions(description: tSearchTerm))
          .thenAnswer((_) async => tFilterList);

      final result =
          await repository.getLatestTransactions(searchTerm: tSearchTerm);

      expect(
        result,
        isA<Right<Failure, List<UserTransaction>>>().having(
          (transactions) => transactions.toOption().toNullable(),
          'list of [UserTransaction]',
          equals(tUserFilterList),
        ),
      );
      verify(() => qvaPayApi.getTransactions(description: tSearchTerm))
          .called(1);
    });

    test(
        'should return [Right<List<UserTransaction>>] depending '
        'on the search parameters `start` and `end`', () async {
      final tStart = DateTime.parse('2021-03-15T03:48:04.000000Z');
      final tEnd = DateTime.parse('2021-03-20T03:48:22.000000Z');

      when(() => qvaPayApi.getTransactions(start: tStart, end: tEnd))
          .thenAnswer((_) async => tFilterList);

      final result =
          await repository.getLatestTransactions(start: tStart, end: tEnd);

      expect(
        result,
        isA<Right<Failure, List<UserTransaction>>>().having(
          (transactions) => transactions.toOption().toNullable(),
          'list of [UserTransaction]',
          equals(tUserFilterList),
        ),
      );
      verify(() => qvaPayApi.getTransactions(start: tStart, end: tEnd))
          .called(1);
    });

    test('should throw [Left<ServerFailure>] when a server-side error occurs',
        () async {
      when(() => qvaPayApi.getTransactions())
          .thenThrow(() async => ServerException());

      final result = await repository.getLatestTransactions();

      expect(
        result,
        equals(const Left<Failure, List<UserTransaction>>(ServerFailure())),
      );
      verify(() => qvaPayApi.getTransactions()).called(1);
    });
  });

  group('processTransaction', () {
    final tUserTransactionCreated = tUserTransactionList[0];
    final tUserTransactionResponse = tUserTransactionList[3];
    final tTransactionQvaPayCreate = tTransactionsQvaPayList[1];
    final tTransactionQvaPayPaid = tTransactionsQvaPayList[3];
    test(
        'should return [Right<UserTransaction>] when the transaction is '
        'successfully created and paid', () async {
      when(() => qvaPayApi.createTransaction(
            uuid: tUserTransactionCreated.uuid,
            amount: tUserTransactionCreated.amount.toDouble(),
            description: tUserTransactionCreated.description,
          )).thenAnswer((_) async => tTransactionQvaPayCreate);
      when(() => qvaPayApi.payTransaction(
            uuid: tTransactionQvaPayCreate.uuid,
          )).thenAnswer((_) async => tTransactionQvaPayPaid);

      final result = await repository.processTransaction(
        transaction: tUserTransactionCreated,
      );

      expect(result, Right<Failure, UserTransaction>(tUserTransactionResponse));
    });

    test(
        'should throw [Left<TransactionFailure>] when the account does '
        'not have enough balance.', () async {
      when(() => qvaPayApi.createTransaction(
            uuid: tUserTransactionCreated.uuid,
            amount: tUserTransactionCreated.amount.toDouble(),
            description: tUserTransactionCreated.description,
          )).thenAnswer((_) async => tTransactionQvaPayCreate);
      when(() => qvaPayApi.payTransaction(
            uuid: tTransactionQvaPayCreate.uuid,
          )).thenThrow(
        const TransactionException(message: 'Does not have enough balance.'),
      );

      final result = await repository.processTransaction(
        transaction: tUserTransactionCreated,
      );

      expect(
        result,
        const Left<Failure, UserTransaction>(
          UserTransactionFailure(message: 'Does not have enough balance.'),
        ),
      );
    });

    test('should throw [Left<TransactionFailure>] when the pin is wrong.',
        () async {
      when(() => qvaPayApi.createTransaction(
            uuid: tUserTransactionCreated.uuid,
            amount: tUserTransactionCreated.amount.toDouble(),
            description: tUserTransactionCreated.description,
          )).thenAnswer((_) async => tTransactionQvaPayCreate);
      when(() => qvaPayApi.payTransaction(
            uuid: tTransactionQvaPayCreate.uuid,
          )).thenThrow(
        const PaymentException(message: 'Incorrect PIN.'),
      );

      final result = await repository.processTransaction(
        transaction: tUserTransactionCreated,
      );

      expect(
        result,
        const Left<Failure, UserTransaction>(
          UserTransactionFailure(message: 'Incorrect PIN.'),
        ),
      );
    });

    test(
        'should throw [Left<ServerFailure>] when an error occurs '
        'on the server while creating the transaction', () async {
      when(() => qvaPayApi.createTransaction(
            uuid: tUserTransactionCreated.uuid,
            amount: tUserTransactionCreated.amount.toDouble(),
            description: tUserTransactionCreated.description,
          )).thenThrow(ServerException());

      final result = await repository.processTransaction(
        transaction: tUserTransactionCreated,
      );

      expect(
        result,
        const Left<Failure, UserTransaction>(ServerFailure()),
      );
    });

    test(
        'should throw [Left<ServerFailure>] when an error occur on the '
        'server in the payment', () async {
      when(() => qvaPayApi.createTransaction(
            uuid: tUserTransactionCreated.uuid,
            amount: tUserTransactionCreated.amount.toDouble(),
            description: tUserTransactionCreated.description,
          )).thenAnswer((_) async => tTransactionQvaPayCreate);
      when(() => qvaPayApi.payTransaction(
            uuid: tTransactionQvaPayCreate.uuid,
          )).thenThrow(ServerException());

      final result = await repository.processTransaction(
        transaction: tUserTransactionCreated,
      );

      expect(
        result,
        const Left<Failure, UserTransaction>(ServerFailure()),
      );
    });
  });
}
