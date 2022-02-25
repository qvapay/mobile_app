import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:formz/formz.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/core/formz/formz.dart';
import 'package:mobile_app/features/transactions/repository/transactions_repository.dart';
import 'package:mobile_app/features/user_data/models/models.dart';

part 'send_transaction_state.dart';

class SendTransactionCubit extends Cubit<SendTransactionState> {
  SendTransactionCubit({
    required ITransactionsRepository transactionsRepository,
  })  : _repository = transactionsRepository,
        super(const SendTransactionState());

  final ITransactionsRepository _repository;

  void changeVisibilityOfAmount({required bool visibility}) {
    emit(state.copyWith(
      amountFieldIsVisible: visibility,
      amount: !visibility ? const AmountFormz.pure() : state.amount,
    ));
  }

  void changeVisibilityOfDescription({required bool visibility}) {
    emit(state.copyWith(
      descriptionFieldIsVisible: visibility,
      description: !visibility ? const NameFormz.pure() : state.description,
    ));
  }

  void changeAmount(String value) {
    value = value.replaceAll(' ', '');
    final amount = AmountFormz.dirty(value);
    final isValid = Formz.validate([amount]) == FormzStatus.valid;
    if (isValid) {
      emit(
        state.copyWith(
          amountFieldIsVisible: true,
          amount: amount,
          createdStatus: Formz.validate([amount]),
        ),
      );
    } else {
      emit(
        state.copyWith(
          amountFieldIsVisible: true,
          amount: amount,
          createdStatus: Formz.validate([amount]),
        ),
      );
    }
  }

  void changeDescription(String description) {
    emit(
      state.copyWith(
        descriptionFieldIsVisible: true,
        description: NameFormz.dirty(description),
      ),
    );
  }

  Future<void> createTransaction(UserTransaction transaction) async {
    if (state.createdStatus.isValid) {
      emit(state.copyWith(createdStatus: FormzStatus.submissionInProgress));
      final transactionCreated =
          await _repository.createTransaction(transaction: transaction);

      emit(transactionCreated.fold(
        (failure) => state.copyWith(
          createdStatus: FormzStatus.submissionFailure,
          errorMessage: failure is UserTransactionFailure
              ? failure.message
              : const ServerFailure().message,
        ),
        (transaction) {
          return state.copyWith(
            createdStatus: FormzStatus.submissionSuccess,
            paidStatus: FormzStatus.valid,
            userTransactionToPay: transaction,
          );
        },
      ));
    }
  }

  Future<void> payTransaction(
    UserTransaction transaction, {
    String? pin,
  }) async {
    if (state.paidStatus.isValid && state.userTransactionToPay != null) {
      emit(state.copyWith(paidStatus: FormzStatus.submissionInProgress));
      final transactionPaid =
          await _repository.payTransaction(transaction: transaction, pin: pin);

      emit(transactionPaid.fold(
        (failure) => state.copyWith(
          paidStatus: FormzStatus.submissionFailure,
          errorMessage: failure is UserTransactionFailure
              ? failure.message
              : const ServerFailure().message,
        ),
        (transaction) {
          return state.copyWith(
            paidStatus: FormzStatus.submissionSuccess,
            userTransactionPaid: transaction,
          );
        },
      ));
    }
  }
}
