import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/widgets.dart';
import 'package:grouped_list/grouped_list.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';
import 'package:mobile_app/core/widgets/list_tile_card_widget.dart';
import 'package:mobile_app/features/services/models/listile.dart';

class ContactList extends StatelessWidget {
  const ContactList({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xffE5E5E5),
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(
            Icons.arrow_back_ios_rounded,
            color: kActiveText,
          ),
          onPressed: () {
            Scaffold.of(context).openDrawer();
          },
          tooltip: MaterialLocalizations.of(context).openAppDrawerTooltip,
        ),
        elevation: 0,
        title: const Center(
          child: Text(
            'Contactos',
            style: kTitleScaffold,
          ),
        ),
        backgroundColor: const Color(0xffE5E5E5),
      ),
      body: Column(
        children: [
          Expanded(
            child: GroupedListView<ListTileData, String>(
                padding: const EdgeInsets.only(top: 15.0),
                elements: LisTileWidget.dataLisTileData,
                groupBy: (element) => element.name[0],
                groupSeparatorBuilder: (String value) => Row(children: [
                      Padding(
                        padding: const EdgeInsets.all(15),
                        child: Container(
                          width: 50,
                          height: 50,
                          decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(10),
                              color: const Color(0xff3D8DE8),
                              boxShadow: const [
                                BoxShadow(
                                    color: Colors.grey,
                                    blurRadius: 5,
                                    offset: Offset(0, 1))
                              ]),
                          child: Padding(
                            padding: const EdgeInsets.all(10),
                            child: Center(
                                child: Text(
                              value,
                              style: const TextStyle(
                                fontSize: 24,
                                color: Color(0xffFFFFFF),
                              ),
                            )),
                          ),
                        ),
                      )
                    ]),
                itemBuilder: (context, dynamic element) => ListTileCard(
                    name: element.name.toString(),
                    avatar: element.avatar.toString(),
                    subtexto: element.subtexto.toString(),
                    credit: element.credit.toString(),
                    date: element.date.toString(),
                    user: true)),
          ),
        ],
      ),
    );
  }
}
