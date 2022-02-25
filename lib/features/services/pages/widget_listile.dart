import 'package:flutter/material.dart';
import 'package:mobile_app/features/services/models/listile.dart';

class WidgetListile extends StatelessWidget {
  const WidgetListile({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        appBar: AppBar(
          elevation: 0,
          title: const Text(
            'Mis Cuentas',
          ),
        ),
        body: ListView.builder(
          itemCount: LisTileWidget.dataLisTile.length,
          itemBuilder: (context, index) => GestureDetector(
            onTap: () {},
            child: Wrap(children: [LisTileWidget.dataLisTile[index]]),
          ),
        ));
  }
}
