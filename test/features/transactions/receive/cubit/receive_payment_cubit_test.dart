import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:formz/formz.dart';
import 'package:mobile_app/core/formz/amount_formz.dart';
import 'package:mobile_app/features/transactions/receive/receive.dart';
import 'package:mobile_app/features/user_data/models/models.dart';

import '../../../../constants.dart';

class FakeUserTransaction extends Fake implements UserTransaction {}

void main() {
  group('ReceivePaymentCubit', () {
    test('initial state', () {
      expect(
        ReceivePaymentCubit(transaction: tUserTransaction).state,
        ReceivePaymentCubit(transaction: tUserTransaction).state,
      );
    });

    blocTest<ReceivePaymentCubit, ReceivePaymentState>(
      'emits [ReceivePaymentState] with `amountIsVisible` as true ',
      build: () {
        return ReceivePaymentCubit(transaction: tUserTransaction);
      },
      act: (cubit) {
        cubit.changeVisibilityOfAmount(capture: false, visibility: true);
      },
      expect: () => <ReceivePaymentState>[
        ReceivePaymentState(
          transaction: tUserTransaction,
          amountIsVisible: true,
        )
      ],
    );
    blocTest<ReceivePaymentCubit, ReceivePaymentState>(
      'emits [ReceivePaymentState] with `capture` as true ',
      build: () {
        return ReceivePaymentCubit(transaction: tUserTransaction);
      },
      act: (cubit) {
        cubit.capture(true);
      },
      expect: () => <ReceivePaymentState>[
        ReceivePaymentState(
          transaction: tUserTransaction,
          isCapture: true,
        )
      ],
    );
    blocTest<ReceivePaymentCubit, ReceivePaymentState>(
      'emits [ReceivePaymentState] when amount is valid',
      build: () {
        return ReceivePaymentCubit(transaction: tUserTransaction);
      },
      act: (cubit) {
        cubit
          ..changeVisibilityOfAmount(visibility: true, capture: false)
          ..changeAmount('123');
      },
      expect: () => <ReceivePaymentState>[
        ReceivePaymentState(
          transaction: tUserTransaction,
          amountIsVisible: true,
        ),
        ReceivePaymentState(
            transaction: tUserTransaction.copyWith(amount: '123'),
            amountIsVisible: true,
            amount: const AmountFormz.dirty('123'),
            status: FormzStatus.valid),
      ],
    );
    blocTest<ReceivePaymentCubit, ReceivePaymentState>(
      'emits [ReceivePaymentState] when amount is not valid',
      build: () {
        return ReceivePaymentCubit(transaction: tUserTransaction);
      },
      act: (cubit) {
        cubit
          ..changeVisibilityOfAmount(visibility: true, capture: false)
          ..changeAmount('-123');
      },
      expect: () => <ReceivePaymentState>[
        ReceivePaymentState(
          transaction: tUserTransaction,
          amountIsVisible: true,
        ),
        ReceivePaymentState(
          transaction: tUserTransaction,
          amountIsVisible: true,
          amount: const AmountFormz.dirty('-123'),
          status: FormzStatus.invalid,
        ),
      ],
    );
  });
}
