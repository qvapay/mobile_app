import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/core/widgets/widgets.dart';

class HeaderTransactionDeatails extends StatelessWidget {
  const HeaderTransactionDeatails({
    Key? key,
    required this.imageUrl,
    required this.name,
    required this.email,
  }) : super(key: key);

  final String imageUrl;
  final String name;
  final String email;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return Column(
      children: [
        SizedBox(
          height: size.height * 0.05,
        ),
        ProfileImageNetworkWidget(
          imageUrl: imageUrl.contains('https://') ? imageUrl : qvapayIconUrl,
          radius: 60,
          borderImage: Border.all(width: 4, color: Colors.white),
        ),
        const SizedBox(
          height: 10,
        ),
        Text(
          name,
          style: kStyleNameReceived,
        ),
        const SizedBox(
          height: 5,
        ),
        Text(
          email,
          style: const TextStyle(
            fontSize: 14,
            fontFamily: 'Roboto',
            fontWeight: FontWeight.bold,
            color: Color(0xFF3186E7),
          ),
        ),
      ],
    );
  }
}
