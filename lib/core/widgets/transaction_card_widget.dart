import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';
import 'package:mobile_app/core/themes/themes.dart';
import 'package:mobile_app/core/widgets/widgets.dart';

class TransactionCardWidget extends StatelessWidget {
  const TransactionCardWidget({
    Key? key,
    required this.name,
    required this.avatar,
    required this.credit,
    required this.date,
    required this.isCredit,
  }) : super(key: key);

  final String name;
  final String avatar;
  final double credit;
  final String date;
  final bool isCredit;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Card(
        elevation: 2,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: ListTile(
          horizontalTitleGap: 7,
          minVerticalPadding: 15,
          title: Text(
            name,
            style: TextStyle(
              fontSize: 14,
              color: Theme.of(context).textTheme.headline1?.color,
              fontFamily: 'Roboto',
              fontWeight: FontWeight.w700,
            ),
            maxLines: 1,
          ),
          subtitle: isCredit
              ? Text(
                  'Crédito',
                  style: TextStyle(
                    fontSize: 14,
                    color: Theme.of(context)
                        .textTheme
                        .headline1
                        ?.color!
                        .withOpacity(0.3),
                    fontFamily: 'Roboto',
                    fontWeight: FontWeight.w700,
                  ),
                )
              : Text(
                  'Compra',
                  style: TextStyle(
                    fontSize: 14,
                    color: Theme.of(context)
                        .textTheme
                        .headline1
                        ?.color!
                        .withOpacity(0.3),
                    fontFamily: 'Roboto',
                    fontWeight: FontWeight.w700,
                  ),
                ),
          leading: ProfileImageNetworkWidget(imageUrl: avatar),
          trailing: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: <Widget>[
                const Padding(padding: EdgeInsets.only(top: 5, right: 16)),
                Text(
                  isCredit ? '+\$$credit' : '-\$$credit',
                  style: isCredit
                      ? const TextStyle(
                          fontSize: 16,
                          color: AppColors.greenInfo,
                          fontFamily: 'Roboto',
                          fontWeight: FontWeight.w700,
                        )
                      : const TextStyle(
                          fontSize: 16,
                          color: AppColors.redInfo,
                          fontFamily: 'Roboto',
                          fontWeight: FontWeight.w700,
                        ),
                ),
                const Padding(padding: EdgeInsets.symmetric(vertical: 2)),
                Text(
                  date,
                  style: kTitleListSubTitlePay,
                ),
              ]),
        ),
      ),
    );
  }
}
