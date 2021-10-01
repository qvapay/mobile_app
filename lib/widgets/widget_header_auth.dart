import 'package:flutter/material.dart';
import 'package:mobile_app/constants/constants.dart';

class HeaderAuth extends StatelessWidget {
  const HeaderAuth({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 320,
      decoration: const BoxDecoration(
          gradient: kLinearGradientBlue,
          borderRadius: BorderRadius.only(
              bottomLeft: Radius.circular(50),
              bottomRight: Radius.circular(50)),
          boxShadow: [
            BoxShadow(
              color: Colors.grey,
              blurRadius: 10,
            )
          ]),
      child: Column(
        children: [
          const Spacer(),
          Expanded(
            flex: 4,
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(15),
                child: CircleAvatar(
                  backgroundColor: Colors.white,
                  radius: 70,
                  child: Image.asset(
                    'assets/avatars/eric.png',
                    height: 130,
                    //width: 100,
                  ),
                ),
              ),
            ),
          ),
          const Text(
            'Erich Garcia Cruz',
            style: kNameLogin,
          ),
          const SizedBox(
            height: 5,
          ),
          const Expanded(
              flex: 2,
              child: Text(
                'ecruz@qvapay.com',
                style: kEmailLogin,
              ))
        ],
      ),
    );
  }
}
