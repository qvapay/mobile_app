import 'package:flutter/material.dart';
import 'package:mobile_app/core/themes/colors.dart';

final ThemeData lightTheme = ThemeData(
  primaryColor: AppColors.textBlue,
  backgroundColor: AppColors.backgroundLight,
  cardColor: Colors.white,
  textTheme: const TextTheme(
    headline1: TextStyle(
      color: Colors.black87,
      fontFamily: 'Roboto',
    ),
  ),
  tabBarTheme: TabBarTheme(
    labelColor: AppColors.textBlue,
    unselectedLabelColor: Colors.black.withOpacity(0.9),
  ),
);
