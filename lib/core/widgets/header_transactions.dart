import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';


class HeaderTransactions extends StatelessWidget {
  const HeaderTransactions({Key? key, required this.saldo}) : super(key: key);

  final String saldo;

  //final Image img;

  @override
  Widget build(BuildContext context) {
    return Container(
        width: double.maxFinite,
        height: 200,
        decoration: const BoxDecoration(
          gradient: kLinearGradientBlue,
          borderRadius: BorderRadius.only(
              bottomLeft: Radius.circular(40),
              bottomRight: Radius.circular(40)),
          /*boxShadow: [
              BoxShadow(
                color: Colors.grey,
                blurRadius: 10,
              )
            ]*/
        ),
        child: Stack(
          children: [
            Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Text(
                    '\$ $saldo',
                    style: styleNumber,
                  ),
                  const SizedBox(
                    height: 10,
                  ),
                  const Text(
                    'Administrar Saldo',
                    style: styleAdmin,
                  ),
                  const SizedBox(
                    height: 20,
                  )
                ],
              ),
            ),
            Positioned(
              top: 15,
              right: 10,
              child: GestureDetector(
                onTap: () {},
                child: Row(
                  children: [
                    const Text(
                      'Wilson Hervitz',
                      style: styleUser,
                    ),
                    const SizedBox(
                      width: 10,
                    ),
                    CircleAvatar(
                      backgroundColor: Colors.white,
                      radius: 20,
                      child: Image.asset(
                        'assets/avatars/eric.png',
                        height: 35,
                        //width: 100,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Positioned(
                top: 8,
                left: 10,
                child: IconButton(
                  icon: const Icon(
                    Icons.menu_open,
                    color: Colors.white,
                    size: 32,
                  ),
                  onPressed: () {},
                ))
          ],
        ));
  }
}
