import 'package:flutter/material.dart';
import 'package:mobile_app/core/widgets/widgets.dart';

class UserServiceCardWidget extends StatelessWidget {
  const UserServiceCardWidget({
    Key? key,
    required this.name,
    required this.avatar,
  }) : super(key: key);

  final String name;
  final String avatar;

  @override
  Widget build(BuildContext context) {
    return Padding(
        padding: const EdgeInsets.all(4),
        child: Card(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          elevation: 4,
          child: Container(
            decoration: ShapeDecoration(
              color: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16)),
            ),
            child: SizedBox(
              width: 220,
              child: Row(
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: ProfileImageNetworkWidget(imageUrl: avatar),
                  ),
                  Text(name,
                      style: const TextStyle(
                        fontSize: 16,
                        fontFamily: 'Roboto',
                        fontWeight: FontWeight.w700,
                      )),
                ],
              ),
            ),
          ),
        ));
  }
}
