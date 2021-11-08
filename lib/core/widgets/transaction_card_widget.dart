import 'package:animations/animations.dart';
import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';
import 'package:mobile_app/core/extensions/extensions.dart';
import 'package:mobile_app/core/widgets/widgets.dart';
import 'package:mobile_app/features/transactions/view/view.dart';
import 'package:mobile_app/features/user_data/models/models.dart';

class TransactionCardWidget extends StatelessWidget {
  const TransactionCardWidget({
    Key? key,
    required this.transaction,
    this.padding = const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
  }) : super(key: key);

  final UserTransaction transaction;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final credit = transaction.amount.toDouble();
    final isTrasactionReceive = credit > 0;
    return Container(
      padding: padding,
      child: OpenContainer<bool>(
          openBuilder: (BuildContext _, VoidCallback openContainer) {
            return TransactionDetailPage(
              title: 'Detalles',
              userTransaction: transaction,
              isFromPayment: false,
            );
          },
          tappable: false,
          closedShape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          closedElevation: 2,
          closedBuilder: (BuildContext _, VoidCallback openContainer) {
            return InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: openContainer,
              child: ListTile(
                horizontalTitleGap: 7,
                minVerticalPadding: 15,
                title: Text(
                  transaction.name,
                  style: kTitleListTitlePay,
                  maxLines: 1,
                ),
                subtitle: isTrasactionReceive
                    ? const Text(
                        'Crédito',
                        style: TextStyle(
                          fontSize: 14,
                          color: Colors.black26,
                          fontFamily: 'Roboto',
                          fontWeight: FontWeight.w700,
                        ),
                      )
                    : const Text(
                        'Compra',
                        style: TextStyle(
                          fontSize: 14,
                          color: Colors.black26,
                          fontFamily: 'Roboto',
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                leading: Hero(
                    tag: 'key_details_${transaction.imageUrl}'
                        '_${transaction.uuid}',
                    child: ProfileImageNetworkWidget(
                        imageUrl: transaction.imageUrl)),
                trailing: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: <Widget>[
                      const Padding(
                          padding: EdgeInsets.only(top: 5, right: 16)),
                      Text(
                        isTrasactionReceive
                            ? '+\$$credit'
                            : '-\$${credit.abs()}',
                        style: isTrasactionReceive
                            ? const TextStyle(
                                fontSize: 16,
                                color: Color(0xFF1FBF2F),
                                fontFamily: 'Roboto',
                                fontWeight: FontWeight.w700,
                              )
                            : const TextStyle(
                                fontSize: 16,
                                color: Colors.red,
                                fontFamily: 'Roboto',
                                fontWeight: FontWeight.w700,
                              ),
                      ),
                      const Padding(padding: EdgeInsets.symmetric(vertical: 2)),
                      Text(
                        transaction.date.toDmY(),
                        style: kTitleListSubTitlePay,
                      ),
                    ]),
              ),
              // ),
            );
          }),
    );
  }
}
