import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';

class ButtonLarge extends StatelessWidget {
  const ButtonLarge(
      {Key? key,
      required this.title,
      required this.styleGradient,
      required this.active,
      required this.onPressed})
      : super(key: key);

  final String title;
  final LinearGradient styleGradient;
  final bool active;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Container(
        width: 328,
        height: 56,
        decoration: BoxDecoration(
          gradient: styleGradient,
          borderRadius: BorderRadius.circular(14),
        ),
        child: RawMaterialButton(
          onPressed: onPressed,
          splashColor: active ? Colors.white38 : kActiveText.withOpacity(0.4),
          shape: const RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(14))),
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
