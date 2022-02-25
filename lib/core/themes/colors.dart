import 'package:flutter/material.dart';

class AppColors {
  AppColors._();

  static const Color backgroundLight = Color(0xffEBECEE);
  static const Color backgroundDark = Color(0xff10151D);

  static const Color cardDark = Color(0xff1D1E24);
  static const Color textGrey = Color(0xffB4B4B4);

  static const Color greenInfo = Color(0xFF1FBF2F);
  static const Color greenDotCard = Color(0xFF2AE83D);
  static const Color redInfo = Color(0xFFBF461F);
  static const Color greyInfo = Color(0xFFC4C4C4);
  static const Color inactiveText = Color(0xFF464646);
  static const Color textBlue = Color(0xFF3186E7);

  static const linearGradientBlue = LinearGradient(
    begin: Alignment.bottomRight,
    end: Alignment.bottomLeft,
    colors: [Color(0xFF2A8DE8), Color(0xFF1962A6)],
  );

  static const linearGradientLargeGreen = LinearGradient(
    begin: Alignment.bottomLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF1B9E28), Color(0xFF1FBF2F)],
  );

  static const linearGradientBlackLight = LinearGradient(
    begin: Alignment.bottomRight,
    end: Alignment.bottomLeft,
    colors: [Color(0xFF282828), Color(0xFF282828)],
  );
}
