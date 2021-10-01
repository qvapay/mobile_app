import 'package:flutter/material.dart';
import 'package:mobile_app/constants/constants.dart';

class ButtonLarge extends StatelessWidget {
  const ButtonLarge(
      {Key? key,
      required this.title,
      required this.styleGradient,
      required this.active,
      required this.onClicked})
      : super(key: key);

  final String title;
  final LinearGradient styleGradient;
  final bool active;
  final VoidCallback onClicked;

  @override
  Widget build(BuildContext context) {
    return TextButton(
        onPressed: onClicked,
        child: Container(
          width: 328,
          height: 56,
          decoration: BoxDecoration(
            gradient: styleGradient,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Center(
              child: Text(
                title,
                style: (active == true)
                    ? kTitleLargeButtonActive
                    : kTitleLargeButtonInActive,
              ),
            ),
          ),
        ));
  }
}
