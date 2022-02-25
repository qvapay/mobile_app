import 'package:flutter/material.dart';
import 'package:mobile_app/core/themes/colors.dart';

final ThemeData darkTheme = ThemeData(
  primaryColor: AppColors.textBlue,
  backgroundColor: AppColors.backgroundDark,
  cardColor: AppColors.cardDark,
  textTheme: const TextTheme(
    headline1: TextStyle(
      color: AppColors.textGrey,
      fontFamily: 'Roboto',
    ),
    subtitle1: TextStyle(
      color: AppColors.textGrey,
      fontFamily: 'Roboto',
    ),
  ),
  tabBarTheme: TabBarTheme(
    labelColor: AppColors.textBlue,
    unselectedLabelColor: AppColors.textGrey.withOpacity(0.9),
  ),
);
