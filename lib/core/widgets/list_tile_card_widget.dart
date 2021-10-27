import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';

class ListTileCard extends StatelessWidget {
  final String name;
  final String subtexto;
  final String avatar;
  final String credit;
  final String date;
  final bool user;

  const ListTileCard(
      {Key? key,
      required this.name,
      required this.avatar,
      required this.subtexto,
      required this.credit,
      required this.date,
      required this.user})
      : super(key: key);

  @override
  Widget build(BuildContext context) {
    return subtexto != ''
        ? Container(
            padding: const EdgeInsets.fromLTRB(16, 5, 20, 5),
            child: Card(
              elevation: 2,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
              child: ListTile(
                horizontalTitleGap: 7,
                minVerticalPadding: 15,
                title: Text(
                  name,
                  style: kTitleListTitlePay,
                  maxLines: 1,
                ),
                subtitle: subtexto != '' ? Text(subtexto) : const Text(''),
                leading: CircleAvatar(
                    radius: 20,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(20),
                      child: Image.asset(avatar),
                    )),
                trailing: Column(children: <Widget>[
                  const Padding(padding: EdgeInsets.only(top: 5, right: 16)),
                  Text(
                    credit,
                    style: kTitleListCreditPay,
                  ),
                  const Padding(padding: EdgeInsets.symmetric(vertical: 2)),
                  Text(
                    date,
                    style: kTitleListSubTitlePay,
                  ),
                ]),
              ),
            ),
          )
        : Card(
            margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
            elevation: 2,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            child: Padding(
              padding: const EdgeInsets.all(10),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                CircleAvatar(
                    radius: 20,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(20),
                      child: Image.asset(avatar),
                    )),
                const SizedBox(width: 8),
                Text(name, style: kTitleListTitlePay),
              ]),
            ),
          );
  }
}
