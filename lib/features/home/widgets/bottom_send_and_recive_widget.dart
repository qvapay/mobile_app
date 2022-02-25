import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/core/themes/colors.dart';
import 'package:mobile_app/features/transactions/transactions.dart';

class BottomSendAndReciveWidget extends StatelessWidget {
  const BottomSendAndReciveWidget({
    Key? key,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 80,
      decoration: const BoxDecoration(
        gradient: AppColors.linearGradientBlackLight,
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          GestureDetector(
            onTap: () => Navigator.push<void>(
                context,
                MaterialPageRoute(
                  builder: (_) => const SendPaymentPage(),
                )),
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
              Navigator.push<void>(
                context,
                MaterialPageRoute<void>(builder: (_) => ReceivePaymentPage()),
              );
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
