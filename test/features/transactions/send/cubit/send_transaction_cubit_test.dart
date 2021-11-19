import 'package:bloc_test/bloc_test.dart';
import 'package:dartz/dartz.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:formz/formz.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/core/formz/amount_formz.dart';
import 'package:mobile_app/core/formz/formz.dart';
import 'package:mobile_app/features/transactions/transactions.dart';
import 'package:mobile_app/features/user_data/models/models.dart';
import 'package:mocktail/mocktail.dart';

import '../../../../constants.dart';

class MockTransactionsRepository extends Mock
    implements ITransactionsRepository {}

void main() {
  group('SendTransactionCubit', () {
    late ITransactionsRepository repository;

    const tAmount = '10.0';
    const tDescription = 'SQP to the moon !';

    final tUserTransactionModel = UserTransaction(
      uuid: 'c9667d83-87ed-4baa-b97c-716d233b5277',
      amount: '1.0',
      email: 'erich@qvapay.com',
      description: 'Payment test form app',
      name: 'Erich Garcia',
      date: tDate,
      imageUrl: imageUrlErich,
      transactionType: TransactionType.p2p,
    );

    setUp(() {
      repository = MockTransactionsRepository();
    });

    test('initial state', () {
      expect(const SendTransactionState(), const SendTransactionState());
    });

    blocTest<SendTransactionCubit, SendTransactionState>(
      'emits [amountFieldIsVisible] as true and [amount] is valid '
      'when is chaged',
      build: () => SendTransactionCubit(transactionsRepository: repository),
      act: (cubit) => cubit
        ..changeVisibilityOfAmount(visibility: true)
        ..changeAmount(tAmount),
      expect: () => const <SendTransactionState>[
        SendTransactionState(amountFieldIsVisible: true),
        SendTransactionState(
          amountFieldIsVisible: true,
          amount: AmountFormz.dirty(tAmount),
          status: FormzStatus.valid,
        )
      ],
    );
    blocTest<SendTransactionCubit, SendTransactionState>(
      'emits [descriptionFieldIsVisible] as true and '
      '[description] when is chaged',
      build: () => SendTransactionCubit(transactionsRepository: repository),
      act: (cubit) => cubit
        ..changeVisibilityOfAmount(visibility: true)
        ..changeAmount(tAmount)
        ..changeVisibilityOfDescription(visibility: true)
        ..changeDescription(tDescription),
      expect: () => const <SendTransactionState>[
        SendTransactionState(amountFieldIsVisible: true),
        SendTransactionState(
          amountFieldIsVisible: true,
          amount: AmountFormz.dirty(tAmount),
          status: FormzStatus.valid,
        ),
        SendTransactionState(
          amountFieldIsVisible: true,
          descriptionFieldIsVisible: true,
          amount: AmountFormz.dirty(tAmount),
          status: FormzStatus.valid,
        ),
        SendTransactionState(
          amountFieldIsVisible: true,
          descriptionFieldIsVisible: true,
          description: NameFormz.dirty(tDescription),
          amount: AmountFormz.dirty(tAmount),
          status: FormzStatus.valid,
        )
      ],
    );

    group('description', () {
      blocTest<SendTransactionCubit, SendTransactionState>(
        'emits [status] as `submissionSuccess` and [userTransactionPaid] '
        'when is completed the payment.',
        setUp: () {
          when(
            () => repository.processTransaction(
              transaction: tUserTransactionModel,
            ),
          ).thenAnswer((_) async =>
              Right<Failure, UserTransaction>(tUserTransactionModel));
        },
        build: () => SendTransactionCubit(transactionsRepository: repository),
        seed: () => const SendTransactionState(
          amountFieldIsVisible: true,
          amount: AmountFormz.dirty(tAmount),
          status: FormzStatus.valid,
        ),
        act: (cubit) => cubit
          ..changeVisibilityOfAmount(visibility: true)
          ..changeAmount(tAmount)
          ..processTransaction(tUserTransactionModel),
        expect: () => <SendTransactionState>[
          const SendTransactionState(
            amountFieldIsVisible: true,
            amount: AmountFormz.dirty(tAmount),
            status: FormzStatus.submissionInProgress,
          ),
          SendTransactionState(
            amountFieldIsVisible: true,
            amount: const AmountFormz.dirty(tAmount),
            userTransactionPaid: tUserTransactionModel,
            status: FormzStatus.submissionSuccess,
          ),
        ],
      );

      blocTest<SendTransactionCubit, SendTransactionState>(
        'emits [status] as `submissionFailure` when occurs an error in '
        'the payment.',
        setUp: () {
          when(
            () => repository.processTransaction(
              transaction: tUserTransactionModel,
            ),
          ).thenAnswer((_) async =>
              const Left<Failure, UserTransaction>(UserTransactionFailure()));
        },
        build: () => SendTransactionCubit(transactionsRepository: repository),
        seed: () => const SendTransactionState(
          amountFieldIsVisible: true,
          amount: AmountFormz.dirty(tAmount),
          status: FormzStatus.valid,
        ),
        act: (cubit) => cubit
          ..changeVisibilityOfAmount(visibility: true)
          ..changeAmount(tAmount)
          ..processTransaction(tUserTransactionModel),
        expect: () => <SendTransactionState>[
          const SendTransactionState(
            amountFieldIsVisible: true,
            amount: AmountFormz.dirty(tAmount),
            status: FormzStatus.submissionInProgress,
          ),
          const SendTransactionState(
            amountFieldIsVisible: true,
            amount: AmountFormz.dirty(tAmount),
            status: FormzStatus.submissionFailure,
            errorMessage: 'Transaction Failure',
          ),
        ],
      );
    });
  });
}
