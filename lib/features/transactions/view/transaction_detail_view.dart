import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/core/extensions/extensions.dart';
import 'package:mobile_app/core/widgets/widgets.dart';
import 'package:mobile_app/features/user_data/models/user_transaction.dart';

class TransactionDetailView extends StatelessWidget {
  const TransactionDetailView({
    Key? key,
    required this.transaction,
  }) : super(key: key);

  final UserTransaction transaction;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final contentH = size.height - AppBar().preferredSize.height;
    return SizedBox(
      height: contentH * 0.85,
      child: Column(
        children: [
          Flexible(
            flex: 3,
            child: Column(
              children: [
                SizedBox(
                  height: contentH >= 500.0 ? 15 : 0,
                ),
                ProfileImageNetworkWidget(
                  imageUrl: transaction.imageUrl.contains('https://')
                      ? transaction.imageUrl
                      : qvapayIconUrl,
                  radius: 60,
                  borderImage: Border.all(width: 4, color: Colors.white),
                ),
                const SizedBox(
                  height: 10,
                ),
                Text(
                  transaction.name,
                  style: kStyleNameReceived,
                ),
                const SizedBox(
                  height: 5,
                ),
                Text(
                  transaction.email ?? '',
                  style: const TextStyle(
                    fontSize: 14,
                    fontFamily: 'Roboto',
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF3186E7),
                  ),
                ),
              ],
            ),
          ),
          Flexible(
            flex: 3,
            child: Column(
              children: [
                const Text(
                  'Pago Realizado!',
                  style: kStyleTextPago,
                ),
                const SizedBox(
                  height: 20,
                ),
                _RowInfo(
                    title: 'Tipo de Operación:',
                    data: transaction.typeToString),
                _RowInfo(
                  title: 'Transaccion:',
                  data: transaction.smallUuid,
                ),
                _RowInfo(
                  title: 'Fecha:',
                  data: transaction.date.format(),
                ),
              ],
            ),
          ),
          Flexible(
            child: Column(
              children: [
                const SizedBox(
                  height: 10,
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: RichText(
                    text: const TextSpan(
                      text: '(*) ',
                      style: kTitleButtonTransaction,
                      children: <TextSpan>[
                        TextSpan(
                            text: 'En QvaPay las transacciones P2P '
                                'carecen de impuestos.',
                            style: kStyleTitlePago),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          )
        ],
      ),
    );
  }
}

class _RowInfo extends StatelessWidget {
  const _RowInfo({Key? key, required this.title, required this.data})
      : super(key: key);

  final String title;
  final String data;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            title,
            style: kStyleTitlePago,
          ),
          Text(data, style: kStyleDataPago),
        ],
      ),
    );
  }
}
