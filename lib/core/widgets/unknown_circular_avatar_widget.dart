import 'package:flutter/material.dart';

class UnknownCircleAvatarWidget extends StatelessWidget {
  const UnknownCircleAvatarWidget({
    Key? key,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return CircleAvatar(
      backgroundColor: Colors.grey[200],
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
