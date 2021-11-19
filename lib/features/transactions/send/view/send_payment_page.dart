import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/core/dependency_injection/dependency_injection.dart';
import 'package:mobile_app/features/transactions/transactions.dart';

class SendPaymentPage extends StatelessWidget {
  const SendPaymentPage({Key? key}) : super(key: key);

  /// Returns a [MaterialPageRoute] to navigate to `this` widget.
  static Route go() {
    return MaterialPageRoute<void>(builder: (_) => const SendPaymentPage());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kbgPage,
      appBar: AppBar(
        title: const Text('Enviar Pago',
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
      ),
      body: BlocProvider(
        create: (_) => SendTransactionCubit(
          transactionsRepository: getIt<ITransactionsRepository>(),
        ),
        child: const SendTransactionView(),
      ),
    );
  }
}
