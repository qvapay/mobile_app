import 'dart:async';
import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:formz/formz.dart';
import 'package:mobile_app/core/formz/formz.dart';
import 'package:mobile_app/features/user_data/models/models.dart';

part 'receive_payment_state.dart';

class ReceivePaymentCubit extends Cubit<ReceivePaymentState> {
  ReceivePaymentCubit({required UserTransaction transaction})
      : super(ReceivePaymentState(transaction: transaction));

  void changeVisibilityOfAmount({
    required bool visibility,
    required bool capture,
  }) =>
      emit(
        state.copyWith(
          transaction: state.transaction,
          amountIsVisible: visibility,
          isCapture: capture,
        ),
      );

  FutureOr<void> changeAmount(String value) {
    value = value.replaceAll(' ', '');
    final amount = AmountFormz.dirty(value);
    final isValid = Formz.validate([amount]) == FormzStatus.valid;
    if (isValid) {
      emit(
        ReceivePaymentState(
          transaction: state.transaction.copyWith(amount: value),
          amountIsVisible: true,
          amount: amount,
          status: Formz.validate([amount]),
        ),
      );
    } else {
      emit(
        ReceivePaymentState(
          transaction: state.transaction,
          amountIsVisible: true,
          amount: amount,
          status: Formz.validate([amount]),
        ),
      );
    }
  }

  void capture(bool capture) {
    emit(state.copyWith(isCapture: capture));
  }
}
