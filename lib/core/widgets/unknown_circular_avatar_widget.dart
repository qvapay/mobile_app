import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/features/setting/theme/cubit/theme_cubit.dart';

class UnknownCircleAvatarWidget extends StatelessWidget {
  const UnknownCircleAvatarWidget({
    Key? key,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return CircleAvatar(
      backgroundColor: context.select((ThemeCubit cubit) => cubit.state)
          ? Colors.grey[600]
          : Colors.grey[200],
      radius: 25,
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Image.asset(
          'assets/images/no_image.png',
        ),
      ),
    );
  }
}
