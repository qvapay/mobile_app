import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';

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
            style: kTitleListTitlePay,
            maxLines: 1,
          ),
          subtitle: isCredit
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
          leading: avatar.contains('https://')
              ? CircleAvatar(
                  backgroundColor: Colors.white,
                  radius: 25,
                  backgroundImage: NetworkImage(
                    avatar,
                  ),
                )
              : CircleAvatar(
                  backgroundColor: Colors.grey[200],
                  radius: 25,
                  child: ClipRRect(
                      borderRadius: BorderRadius.circular(20),
                      child: Padding(
                        padding: const EdgeInsets.all(8),
                        child: Image.asset(
                          'assets/images/no_image.png',
                          height: 70,
                        ),
                      ))),
          trailing: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: <Widget>[
                const Padding(padding: EdgeInsets.only(top: 5, right: 16)),
                Text(
                  isCredit ? '+\$$credit' : '-\$$credit',
                  style: isCredit
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
                  date,
                  style: kTitleListSubTitlePay,
                ),
              ]),
        ),
      ),
    );
  }
}
