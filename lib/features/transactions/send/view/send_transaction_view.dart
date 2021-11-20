import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:formz/formz.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/features/transactions/transactions.dart';
import 'package:mobile_app/features/user_data/user_data.dart';

class SendTransactionView extends StatelessWidget {
  const SendTransactionView({Key? key, required this.transaction})
      : super(key: key);

  final UserTransaction transaction;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return Stack(fit: StackFit.expand, children: [
      SingleChildScrollView(
        child: Column(
          children: [
            Center(
              child: HeaderTransactionDeatails(
                name: transaction.name,
                email: transaction.email ?? '',
                imageUrl: transaction.imageUrl,
              ),
            ),
            SizedBox(height: size.height * 0.05),
            BlocBuilder<SendTransactionCubit, SendTransactionState>(
              builder: (context, state) {
                if (state.createdStatus.isSubmissionSuccess ||
                    state.createdStatus.isSubmissionInProgress) {
                  return Text(
                    state.amount.value,
                    style: const TextStyle(
                      fontSize: 20,
                      color: Colors.black54,
                      fontFamily: 'Roboto',
                      fontWeight: FontWeight.w900,
                    ),
                  );
                }
                return AmountTextField(transaction: transaction);
              },
            ),
            SizedBox(height: size.height * 0.05),
            BlocBuilder<SendTransactionCubit, SendTransactionState>(
              builder: (context, state) {
                if (state.createdStatus.isSubmissionSuccess ||
                    state.createdStatus.isSubmissionInProgress) {
                  return Text(
                    state.description.value,
                    style: const TextStyle(
                      fontSize: 14,
                      color: Colors.black45,
                      fontFamily: 'Roboto',
                      fontWeight: FontWeight.w900,
                    ),
                  );
                }
                return DescriptionTextField(transaction: transaction);
              },
            ),
            SizedBox(height: size.height * 0.25),
          ],
        ),
      ),
      Positioned.fill(
        // bottom: MediaQuery.of(context).viewInsets.bottom,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Align(
            alignment: Alignment.bottomCenter,
            child: BlocConsumer<SendTransactionCubit, SendTransactionState>(
              listener: (context, state) {
                if (state.createdStatus.isSubmissionFailure) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                    content:
                        Text(state.errorMessage ?? 'Error al crear el pago !!'),
                  ));
                }
                if (state.paidStatus.isSubmissionFailure) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                    content: Text(
                        state.errorMessage ?? 'Error al copletar el pago !!'),
                  ));
                } else if (state.paidStatus.isSubmissionSuccess) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                    content: Text('Trandeferencia enviada !!'),
                  ));
                  Navigator.pushReplacement<void, void>(
                      context,
                      TransactionDetailPage.go(
                        isFromPayment: true,
                        title: 'Detalles',
                        userTransaction: state.userTransactionPaid!,
                      ));
                }
              },
              builder: (context, state) {
                if (state.createdStatus.isSubmissionSuccess) {
                  return Padding(
                    padding: const EdgeInsets.all(8),
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 150),
                      child: state.paidStatus.isSubmissionInProgress
                          ? const CircularProgressIndicator()
                          : QButtom(
                              width: size.width,
                              height: kToolbarHeight,
                              styleGradient: (state.paidStatus.isValid &&
                                      state.amountFieldIsVisible)
                                  ? kLinearGradientLargeGreen
                                  : kLinearGradientGrey,
                              text: 'Confirmar Pago',
                              onPressed: () {
                                if (state.paidStatus.isValid) {
                                  context
                                      .read<SendTransactionCubit>()
                                      .payTransaction(
                                        state.userTransactionToPay!,
                                      );
                                }
                              },
                            ),
                    ),
                  );
                }
                return AnimatedSwitcher(
                  duration: const Duration(milliseconds: 150),
                  child: state.createdStatus.isSubmissionInProgress
                      ? const CircularProgressIndicator()
                      : QButtom(
                          width: size.width,
                          height: kToolbarHeight,
                          styleGradient: (state.createdStatus.isValid &&
                                  state.amountFieldIsVisible)
                              ? kLinearGradientLargeGreen
                              : kLinearGradientGrey,
                          text: 'Realizar Pago',
                          onPressed: () {
                            if (state.createdStatus.isValid) {
                              context
                                  .read<SendTransactionCubit>()
                                  .createTransaction(transaction);
                            }
                          },
                        ),
                );
              },
            ),
          ),
        ),
      ),
    ]);
  }
}
