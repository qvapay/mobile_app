import 'package:flutter/material.dart';

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
                    child: avatar.contains('https://')
                        ? CircleAvatar(
                            backgroundColor: Colors.white,
                            radius: 25,
                            backgroundImage: NetworkImage(
                              avatar,
                            ),
                          )
                        : CircleAvatar(
                            backgroundColor: Colors.grey[200],
                            radius: 25,
                            child: ClipRRect(
                                borderRadius: BorderRadius.circular(20),
                                child: Padding(
                                  padding: const EdgeInsets.all(8),
                                  child: Image.asset(
                                    'assets/images/no_image.png',
                                    height: 70,
                                  ),
                                ))),
                  ),
                  Text(name,
                      style: const TextStyle(
                        fontSize: 16,
                        fontFamily: 'Roboto',
                        fontWeight: FontWeight.w700,
                      )),
                ],
              ),
              // height: 150,
            ),
          ),
        ));
  }
}
