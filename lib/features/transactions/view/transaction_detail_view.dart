import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/core/extensions/extensions.dart';
import 'package:mobile_app/core/widgets/widgets.dart';
import 'package:mobile_app/features/user_data/models/user_transaction.dart';

class TransactionDetailView extends StatelessWidget {
  const TransactionDetailView({
    Key? key,
    required this.transaction,
    required this.isFromPayment,
  }) : super(key: key);

  final UserTransaction transaction;
  final bool isFromPayment;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return SizedBox(
      height: (size.height - kToolbarHeight) * 0.85,
      child: Column(
        children: [
          Flexible(
            flex: 3,
            child: Column(
              children: [
                SizedBox(
                  height: size.height * 0.02,
                ),
                Hero(
                  tag: isFromPayment
                      ? 'key_payment_${transaction.imageUrl}'
                          '_${transaction.uuid}'
                      : 'key_details_${transaction.imageUrl}'
                          '_${transaction.uuid}',
                  child: ProfileImageNetworkWidget(
                    imageUrl: transaction.imageUrl.contains('https://')
                        ? transaction.imageUrl
                        : qvapayIconUrl,
                    radius: 60,
                    borderImage: Border.all(width: 4, color: Colors.white),
                  ),
                ),
                const SizedBox(
                  height: 10,
                ),
                Text(
                  transaction.name,
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Theme.of(context).textTheme.headline1!.color,
                  ),
                ),
                const SizedBox(
                  height: 5,
                ),
                Text(
                  transaction.email ?? '',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Theme.of(context).primaryColor,
                  ),
                ),
              ],
            ),
          ),
          Flexible(
            flex: 3,
            child: Column(
              children: [
                if (isFromPayment)
                  Column(
                    children: [
                      Text(
                        'Pago Realizado!',
                        style: TextStyle(
                          fontSize: 30,
                          fontWeight: FontWeight.bold,
                          color: Theme.of(context).primaryColor,
                        ),
                      ),
                      const SizedBox(
                        height: 20,
                      ),
                    ],
                  ),
                _RowInfo(
                  title: 'Tipo de Operación:',
                  data: transaction.typeToString,
                ),
                _RowInfo(
                  title: 'Monto:',
                  data: r'$ ' + transaction.amount,
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Transacción:',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Theme.of(context).textTheme.headline1!.color,
                        ),
                      ),
                      GestureDetector(
                        onTap: () {
                          Clipboard.setData(
                            ClipboardData(text: transaction.uuid),
                          );

                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Copiado al portapapeles !!'),
                              duration: Duration(seconds: 1),
                            ),
                          );
                        },
                        child: Text(
                          transaction.smallUuid,
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Theme.of(context).primaryColor,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                _RowInfo(
                  title: 'Fecha:',
                  data: transaction.date.toDmY(),
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
                    text: TextSpan(
                      text: '(*) ',
                      style: TextStyle(
                        fontSize: 14,
                        color: Theme.of(context).primaryColor,
                        fontWeight: FontWeight.w700,
                      ),
                      children: <TextSpan>[
                        TextSpan(
                          text: 'En QvaPay las transacciones P2P '
                              'carecen de impuestos.',
                          style: TextStyle(
                            fontSize: 16,
                            fontFamily: 'Roboto',
                            fontWeight: FontWeight.bold,
                            color: Theme.of(context).textTheme.headline1!.color,
                          ),
                        ),
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
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Theme.of(context).textTheme.headline1!.color,
            ),
          ),
          Text(
            data,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Theme.of(context).primaryColor,
            ),
          ),
        ],
      ),
    );
  }
}
