import 'package:flutter/material.dart';

class QButtom extends StatelessWidget {
  const QButtom({
    Key? key,
    this.icon,
    required this.text,
    required this.styleGradient,
    required this.onPressed,
    required this.width,
    required this.height,
  }) : super(key: key);

  final Widget? icon;
  final String text;
  final LinearGradient styleGradient;
  final VoidCallback onPressed;
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        gradient: styleGradient,
        borderRadius: BorderRadius.circular(16),
      ),
      child: RawMaterialButton(
        shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(16))),
        onPressed: onPressed,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (icon != null)
              Row(
                children: [
                  icon ?? const SizedBox.shrink(),
                  const SizedBox(
                    width: 6,
                  ),
                ],
              ),
            Text(text,
                style: const TextStyle(
                  fontSize: 16,
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ))
          ],
        ),
      ),
    );
  }
}
