part of 'send_transaction_cubit.dart';

class SendTransactionState extends Equatable {
  const SendTransactionState({
    this.amountFieldIsVisible = false,
    this.descriptionFieldIsVisible = false,
    this.amount = const AmountFormz.pure(),
    this.description = const NameFormz.pure(),
    this.status = FormzStatus.pure,
    this.userTransactionPaid,
    this.errorMessage,
  });

  final bool amountFieldIsVisible;
  final bool descriptionFieldIsVisible;
  final AmountFormz amount;
  final NameFormz description;
  final FormzStatus status;
  final UserTransaction? userTransactionPaid;
  final String? errorMessage;

  @override
  List<Object?> get props {
    return [
      amountFieldIsVisible,
      descriptionFieldIsVisible,
      amount,
      description,
      status,
      userTransactionPaid,
      errorMessage,
    ];
  }

  SendTransactionState copyWith({
    bool? amountFieldIsVisible,
    bool? descriptionFieldIsVisible,
    AmountFormz? amount,
    NameFormz? description,
    FormzStatus? status,
    UserTransaction? userTransactionPaid,
    String? errorMessage,
  }) {
    return SendTransactionState(
      amountFieldIsVisible: amountFieldIsVisible ?? this.amountFieldIsVisible,
      descriptionFieldIsVisible:
          descriptionFieldIsVisible ?? this.descriptionFieldIsVisible,
      amount: amount ?? this.amount,
      description: description ?? this.description,
      status: status ?? this.status,
      userTransactionPaid: userTransactionPaid ?? this.userTransactionPaid,
      errorMessage: errorMessage ?? this.errorMessage,
    );
  }
}
