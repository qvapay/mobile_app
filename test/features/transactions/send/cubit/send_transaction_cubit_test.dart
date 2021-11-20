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
  group('SendTransactionCubit', () {
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
          createdStatus: FormzStatus.valid,
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
          createdStatus: FormzStatus.valid,
        ),
        SendTransactionState(
          amountFieldIsVisible: true,
          descriptionFieldIsVisible: true,
          amount: AmountFormz.dirty(tAmount),
          createdStatus: FormzStatus.valid,
        ),
        SendTransactionState(
          amountFieldIsVisible: true,
          descriptionFieldIsVisible: true,
          description: NameFormz.dirty(tDescription),
          amount: AmountFormz.dirty(tAmount),
          createdStatus: FormzStatus.valid,
        )
      ],
    );

    group('createTransaction', () {
      blocTest<SendTransactionCubit, SendTransactionState>(
        'emits [createdStatus] as `submissionSuccess` when is create '
        'the transaction successfuly.',
        setUp: () {
          when(
            () => repository.createTransaction(
              transaction: tUserTransactionModel,
            ),
          ).thenAnswer((_) async =>
              Right<Failure, UserTransaction>(tUserTransactionModel));
        },
        build: () => SendTransactionCubit(transactionsRepository: repository),
        seed: () => const SendTransactionState(
          amountFieldIsVisible: true,
          amount: AmountFormz.dirty(tAmount),
          createdStatus: FormzStatus.valid,
        ),
        act: (cubit) => cubit
          ..changeVisibilityOfAmount(visibility: true)
          ..changeAmount(tAmount)
          ..createTransaction(tUserTransactionModel),
        expect: () => <SendTransactionState>[
          const SendTransactionState(
            amountFieldIsVisible: true,
            amount: AmountFormz.dirty(tAmount),
            createdStatus: FormzStatus.submissionInProgress,
          ),
          SendTransactionState(
            amountFieldIsVisible: true,
            amount: const AmountFormz.dirty(tAmount),
            createdStatus: FormzStatus.submissionSuccess,
            paidStatus: FormzStatus.valid,
            userTransactionToPay: tUserTransactionModel,
          ),
        ],
      );

      blocTest<SendTransactionCubit, SendTransactionState>(
        'emits [createdStatus] as `invalid` when the `amount is invalid.',
        setUp: () {
          when(
            () => repository.createTransaction(
              transaction: tUserTransactionModel,
            ),
          ).thenAnswer((_) async =>
              Right<Failure, UserTransaction>(tUserTransactionModel));
        },
        build: () => SendTransactionCubit(transactionsRepository: repository),
        seed: () => const SendTransactionState(
          amountFieldIsVisible: true,
          amount: AmountFormz.dirty(tAmount),
        ),
        act: (cubit) => cubit
          ..changeVisibilityOfAmount(visibility: true)
          ..changeAmount('-$tAmount'),
        expect: () => const <SendTransactionState>[
          SendTransactionState(
            amountFieldIsVisible: true,
            amount: AmountFormz.dirty('-$tAmount'),
            createdStatus: FormzStatus.invalid,
          ),
        ],
      );

      blocTest<SendTransactionCubit, SendTransactionState>(
        'emits [createdStatus] as `submissionFailure` when occurs an error '
        'while creating the transaction.',
        setUp: () {
          when(
            () => repository.createTransaction(
              transaction: tUserTransactionModel,
            ),
          ).thenAnswer((_) async =>
              const Left<Failure, UserTransaction>(UserTransactionFailure()));
        },
        build: () => SendTransactionCubit(transactionsRepository: repository),
        seed: () => const SendTransactionState(
          amountFieldIsVisible: true,
          amount: AmountFormz.dirty(tAmount),
          createdStatus: FormzStatus.valid,
        ),
        act: (cubit) => cubit
          ..changeVisibilityOfAmount(visibility: true)
          ..changeAmount(tAmount)
          ..createTransaction(tUserTransactionModel),
        expect: () => <SendTransactionState>[
          const SendTransactionState(
            amountFieldIsVisible: true,
            amount: AmountFormz.dirty(tAmount),
            createdStatus: FormzStatus.submissionInProgress,
          ),
          const SendTransactionState(
            amountFieldIsVisible: true,
            amount: AmountFormz.dirty(tAmount),
            createdStatus: FormzStatus.submissionFailure,
            errorMessage: 'Transaction Failure',
          ),
        ],
      );
      blocTest<SendTransactionCubit, SendTransactionState>(
        'emits [createdStatus] as `submissionFailure` when occurs an error '
        'on the server while creating the transaction.',
        setUp: () {
          when(
            () => repository.createTransaction(
              transaction: tUserTransactionModel,
            ),
          ).thenAnswer((_) async =>
              const Left<Failure, UserTransaction>(ServerFailure()));
        },
        build: () => SendTransactionCubit(transactionsRepository: repository),
        seed: () => const SendTransactionState(
          amountFieldIsVisible: true,
          amount: AmountFormz.dirty(tAmount),
          createdStatus: FormzStatus.valid,
        ),
        act: (cubit) => cubit
          ..changeVisibilityOfAmount(visibility: true)
          ..changeAmount(tAmount)
          ..createTransaction(tUserTransactionModel),
        expect: () => <SendTransactionState>[
          const SendTransactionState(
            amountFieldIsVisible: true,
            amount: AmountFormz.dirty(tAmount),
            createdStatus: FormzStatus.submissionInProgress,
          ),
          const SendTransactionState(
            amountFieldIsVisible: true,
            amount: AmountFormz.dirty(tAmount),
            createdStatus: FormzStatus.submissionFailure,
            errorMessage: 'Server Failure',
          ),
        ],
      );
    });

    group('payTransaction', () {
      blocTest<SendTransactionCubit, SendTransactionState>(
        'emits [paidStatus] as `submissionSuccess` when is paid '
        'the transaction successfuly.',
        setUp: () {
          when(
            () => repository.createTransaction(
              transaction: tUserTransactionModel,
            ),
          ).thenAnswer((_) async =>
              Right<Failure, UserTransaction>(tUserTransactionModel));
          when(
            () => repository.payTransaction(
              transaction: tUserTransactionModel,
              pin: '1111',
            ),
          ).thenAnswer((_) async =>
              Right<Failure, UserTransaction>(tUserTransactionModel));
        },
        build: () => SendTransactionCubit(transactionsRepository: repository),
        seed: () => SendTransactionState(
          amountFieldIsVisible: true,
          amount: const AmountFormz.dirty(tAmount),
          createdStatus: FormzStatus.submissionSuccess,
          paidStatus: FormzStatus.valid,
          userTransactionToPay: tUserTransactionModel,
        ),
        act: (cubit) => cubit
          ..createTransaction(tUserTransactionModel)
          ..payTransaction(tUserTransactionModel, pin: '1111'),
        expect: () => <SendTransactionState>[
          SendTransactionState(
            amountFieldIsVisible: true,
            amount: const AmountFormz.dirty(tAmount),
            createdStatus: FormzStatus.submissionSuccess,
            paidStatus: FormzStatus.submissionInProgress,
            userTransactionToPay: tUserTransactionModel,
          ),
          SendTransactionState(
            amountFieldIsVisible: true,
            amount: const AmountFormz.dirty(tAmount),
            createdStatus: FormzStatus.submissionSuccess,
            paidStatus: FormzStatus.submissionSuccess,
            userTransactionToPay: tUserTransactionModel,
            userTransactionPaid: tUserTransactionModel,
          ),
        ],
      );

      blocTest<SendTransactionCubit, SendTransactionState>(
        'emits [paidStatus] as `submissionFailure` when occurs an error '
        'while creating the transaction.',
        setUp: () {
          when(
            () => repository.createTransaction(
              transaction: tUserTransactionModel,
            ),
          ).thenAnswer((_) async =>
              Right<Failure, UserTransaction>(tUserTransactionModel));
          when(
            () => repository.payTransaction(
              transaction: tUserTransactionModel,
              pin: '1111',
            ),
          ).thenAnswer((_) async =>
              const Left<Failure, UserTransaction>(UserTransactionFailure()));
        },
        build: () => SendTransactionCubit(transactionsRepository: repository),
        seed: () => SendTransactionState(
          amountFieldIsVisible: true,
          amount: const AmountFormz.dirty(tAmount),
          createdStatus: FormzStatus.submissionSuccess,
          paidStatus: FormzStatus.valid,
          userTransactionToPay: tUserTransactionModel,
        ),
        act: (cubit) => cubit
          ..createTransaction(tUserTransactionModel)
          ..payTransaction(tUserTransactionModel, pin: '1111'),
        expect: () => <SendTransactionState>[
          SendTransactionState(
            amountFieldIsVisible: true,
            amount: const AmountFormz.dirty(tAmount),
            createdStatus: FormzStatus.submissionSuccess,
            paidStatus: FormzStatus.submissionInProgress,
            userTransactionToPay: tUserTransactionModel,
          ),
          SendTransactionState(
            amountFieldIsVisible: true,
            amount: const AmountFormz.dirty(tAmount),
            createdStatus: FormzStatus.submissionSuccess,
            paidStatus: FormzStatus.submissionFailure,
            userTransactionToPay: tUserTransactionModel,
            errorMessage: 'Transaction Failure',
          ),
        ],
      );
      blocTest<SendTransactionCubit, SendTransactionState>(
        'emits [paidStatus] as `submissionFailure` when occurs an error '
        'on the server while creating the transaction ',
        setUp: () {
          when(
            () => repository.createTransaction(
              transaction: tUserTransactionModel,
            ),
          ).thenAnswer((_) async =>
              Right<Failure, UserTransaction>(tUserTransactionModel));
          when(
            () => repository.payTransaction(
              transaction: tUserTransactionModel,
              pin: '1111',
            ),
          ).thenAnswer((_) async =>
              const Left<Failure, UserTransaction>(ServerFailure()));
        },
        build: () => SendTransactionCubit(transactionsRepository: repository),
        seed: () => SendTransactionState(
          amountFieldIsVisible: true,
          amount: const AmountFormz.dirty(tAmount),
          createdStatus: FormzStatus.submissionSuccess,
          paidStatus: FormzStatus.valid,
          userTransactionToPay: tUserTransactionModel,
        ),
        act: (cubit) => cubit
          ..createTransaction(tUserTransactionModel)
          ..payTransaction(tUserTransactionModel, pin: '1111'),
        expect: () => <SendTransactionState>[
          SendTransactionState(
            amountFieldIsVisible: true,
            amount: const AmountFormz.dirty(tAmount),
            createdStatus: FormzStatus.submissionSuccess,
            paidStatus: FormzStatus.submissionInProgress,
            userTransactionToPay: tUserTransactionModel,
          ),
          SendTransactionState(
            amountFieldIsVisible: true,
            amount: const AmountFormz.dirty(tAmount),
            createdStatus: FormzStatus.submissionSuccess,
            paidStatus: FormzStatus.submissionFailure,
            userTransactionToPay: tUserTransactionModel,
            errorMessage: 'Server Failure',
          ),
        ],
      );
    });
  });
}
