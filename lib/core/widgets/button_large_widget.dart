import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';

class ButtonLarge extends StatelessWidget {
  const ButtonLarge({
    Key? key,
    required this.title,
    required this.styleGradient,
    required this.active,
    required this.onPressed,
    this.padding = const EdgeInsets.all(8),
  }) : super(key: key);

  final String title;
  final LinearGradient styleGradient;
  final bool active;
  final VoidCallback onPressed;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    return Container(
        width: width * 0.9,
        height: kToolbarHeight + 4,
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
            padding: padding,
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
