import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/features/transactions/view/transaction_detail_view.dart';
import 'package:mobile_app/features/user_data/models/models.dart';

class TransactionDetailPage extends StatelessWidget {
  const TransactionDetailPage({
    Key? key,
    required this.title,
    required this.userTransaction,
    required this.isFromPayment,
  }) : super(key: key);

  /// Returns a [MaterialPageRoute] to navigate to `this` widget.
  static Route go({
    required UserTransaction userTransaction,
    required String title,
    required bool isFromPayment,
  }) {
    return MaterialPageRoute<void>(
        builder: (_) => TransactionDetailPage(
              userTransaction: userTransaction,
              title: title,
              isFromPayment: isFromPayment,
            ));
  }

  final UserTransaction userTransaction;
  final String title;
  final bool isFromPayment;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).backgroundColor,
      appBar: AppBar(
        title: Text(
          title,
          style: TextStyle(
            fontSize: 20,
            color: Theme.of(context).primaryColor,
            fontFamily: 'Roboto',
            fontWeight: FontWeight.w900,
          ),
        ),
        centerTitle: true,
        backgroundColor: Theme.of(context).backgroundColor,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(
            Icons.arrow_back_ios,
            color: kActiveText,
          ),
          onPressed: () => Navigator.pop(context),
        ),
        actions: isFromPayment
            ? [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: TextButton(
                      onPressed: () {},
                      child: const Text(
                        'Cancelar',
                        style: TextStyle(
                          fontSize: 16,
                          color: Color(0xFFBF461F),
                          fontFamily: 'Roboto',
                          fontWeight: FontWeight.w700,
                        ),
                      )),
                )
              ]
            : null,
      ),
      body: TransactionDetailView(
        transaction: userTransaction,
        isFromPayment: isFromPayment,
      ),
    );
  }
}
