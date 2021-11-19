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
          status: Formz.validate([amount]),
        ),
      );
    } else {
      emit(
        state.copyWith(
          amountFieldIsVisible: true,
          amount: amount,
          status: Formz.validate([amount]),
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

  Future<void> processTransaction(UserTransaction transaction) async {
    final tct = transaction.copyWith(
      amount: state.amount.value,
      description: transaction.description,
    );
    if (state.status.isValid) {
      emit(state.copyWith(status: FormzStatus.submissionInProgress));
      final transactionToPay =
          await _repository.processTransaction(transaction: tct);

      emit(transactionToPay.fold(
        (failure) => state.copyWith(
          status: FormzStatus.submissionFailure,
          errorMessage: failure is UserTransactionFailure
              ? failure.message
              : const ServerFailure().message,
        ),
        (transaction) {
          print(transaction.email);
          return state.copyWith(
            status: FormzStatus.submissionSuccess,
            userTransactionPaid: transaction,
          );
        },
      ));
    }
  }
}
