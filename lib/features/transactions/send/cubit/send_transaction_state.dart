part of 'send_transaction_cubit.dart';

class SendTransactionState extends Equatable {
  const SendTransactionState({
    this.amountFieldIsVisible = false,
    this.descriptionFieldIsVisible = false,
    this.amount = const AmountFormz.pure(),
    this.description = const NameFormz.pure(),
    this.createdStatus = FormzStatus.pure,
    this.paidStatus = FormzStatus.pure,
    this.userTransactionPaid,
    this.userTransactionToPay,
    this.errorMessage,
  });

  final bool amountFieldIsVisible;
  final bool descriptionFieldIsVisible;
  final AmountFormz amount;
  final NameFormz description;
  final FormzStatus createdStatus;
  final FormzStatus paidStatus;
  final UserTransaction? userTransactionPaid;
  final UserTransaction? userTransactionToPay;
  final String? errorMessage;

  @override
  List<Object?> get props {
    return [
      amountFieldIsVisible,
      descriptionFieldIsVisible,
      amount,
      description,
      createdStatus,
      paidStatus,
      userTransactionPaid,
      userTransactionToPay,
      errorMessage,
    ];
  }

  SendTransactionState copyWith({
    bool? amountFieldIsVisible,
    bool? descriptionFieldIsVisible,
    AmountFormz? amount,
    NameFormz? description,
    FormzStatus? createdStatus,
    FormzStatus? paidStatus,
    UserTransaction? userTransactionPaid,
    UserTransaction? userTransactionToPay,
    String? errorMessage,
  }) {
    return SendTransactionState(
      amountFieldIsVisible: amountFieldIsVisible ?? this.amountFieldIsVisible,
      descriptionFieldIsVisible:
          descriptionFieldIsVisible ?? this.descriptionFieldIsVisible,
      amount: amount ?? this.amount,
      description: description ?? this.description,
      createdStatus: createdStatus ?? this.createdStatus,
      paidStatus: paidStatus ?? this.paidStatus,
      userTransactionPaid: userTransactionPaid ?? this.userTransactionPaid,
      userTransactionToPay: userTransactionToPay ?? this.userTransactionToPay,
      errorMessage: errorMessage ?? this.errorMessage,
    );
  }
}
