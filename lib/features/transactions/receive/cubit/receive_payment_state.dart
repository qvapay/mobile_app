part of 'receive_payment_cubit.dart';

class ReceivePaymentState extends Equatable {
  const ReceivePaymentState({
    required this.transaction,
    this.amountIsVisible = false,
    this.amount = const AmountFormz.pure(),
    this.status = FormzStatus.pure,
    this.isCapture = false,
  });

  final UserTransaction transaction;
  final bool amountIsVisible;
  final AmountFormz amount;
  final FormzStatus status;
  final bool isCapture;

  @override
  List<Object> get props {
    return [
      transaction,
      amountIsVisible,
      amount,
      status,
      isCapture,
    ];
  }

  ReceivePaymentState copyWith({
    UserTransaction? transaction,
    bool? amountIsVisible,
    AmountFormz? amount,
    FormzStatus? status,
    bool? isCapture,
  }) {
    return ReceivePaymentState(
      transaction: transaction ?? this.transaction,
      amountIsVisible: amountIsVisible ?? this.amountIsVisible,
      amount: amount ?? this.amount,
      status: status ?? this.status,
      isCapture: isCapture ?? this.isCapture,
    );
  }
}
