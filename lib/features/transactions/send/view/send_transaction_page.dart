import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:formz/formz.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/features/home/home.dart';
import 'package:mobile_app/features/transactions/transactions.dart';
import 'package:mobile_app/features/user_data/user_data.dart';

class SendTransactionPage extends StatelessWidget {
  const SendTransactionPage({Key? key, required this.transaction})
      : super(key: key);

  /// Returns a [MaterialPageRoute] to navigate to `this` widget.
  static Route go({required UserTransaction transaction}) {
    return MaterialPageRoute<void>(
      builder: (_) => SendTransactionPage(transaction: transaction),
    );
  }

  final UserTransaction transaction;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kbgPage,
      appBar: AppBar(
        title: const Text('Enviar Transacción',
            style: TextStyle(
              fontSize: 20,
              color: Color(0xFF3186E7),
              fontFamily: 'Roboto',
              fontWeight: FontWeight.w900,
            )),
        centerTitle: true,
        backgroundColor: kbgPage,
        elevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(
            Icons.arrow_back_ios,
            color: kActiveText,
          ),
        ),
        actions: [
          BlocBuilder<SendTransactionCubit, SendTransactionState>(
            builder: (context, state) {
              if (state.createdStatus.isSubmissionSuccess) {
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: TextButton(
                      onPressed: () {
                        Navigator.pushAndRemoveUntil<void>(
                          context,
                          HomePage.go(),
                          (route) => false,
                        );
                      },
                      child: const Text(
                        'Cancelar',
                        style: TextStyle(
                          fontSize: 16,
                          color: Color(0xFFBF461F),
                          fontFamily: 'Roboto',
                          fontWeight: FontWeight.w700,
                        ),
                      )),
                );
              }
              return const SizedBox.shrink();
            },
          )
        ],
      ),
      body: SendTransactionView(transaction: transaction),
    );
  }
}
