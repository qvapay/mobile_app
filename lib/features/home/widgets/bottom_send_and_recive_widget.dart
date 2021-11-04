import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/constants.dart';

class BottomSendAndReciveWidget extends StatelessWidget {
  const BottomSendAndReciveWidget({
    Key? key,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 80,
      decoration: const BoxDecoration(
        gradient: kLinearGradientBlackLight,
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          GestureDetector(
            onTap: () {
              debugPrint('Enviar');
            },
            child: Row(
              children: const [
                Icon(
                  Icons.arrow_upward_sharp,
                  color: Colors.white70,
                  size: 24,
                ),
                SizedBox(
                  width: 5,
                ),
                Text(
                  'Enviar',
                  style: styleSendRec,
                ),
              ],
            ),
          ),
          const SizedBox(
            width: 45,
          ),
          GestureDetector(
            onTap: () {
              debugPrint('Recibir');
            },
            child: Row(
              children: const [
                Icon(
                  Icons.arrow_downward,
                  color: Colors.white70,
                  size: 24,
                ),
                SizedBox(
                  width: 5,
                ),
                Text(
                  'Recibir',
                  style: styleSendRec,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
