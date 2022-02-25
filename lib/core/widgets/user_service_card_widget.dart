import 'package:flutter/material.dart';
import 'package:mobile_app/core/widgets/widgets.dart';

class UserServiceCardWidget extends StatelessWidget {
  const UserServiceCardWidget({
    Key? key,
    required this.name,
    this.subtitle,
    required this.avatar,
  }) : super(key: key);

  final String name;
  final String? subtitle;
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
              color: Theme.of(context).cardColor,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            child: SizedBox(
              width: 220,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      child: ProfileImageNetworkWidget(imageUrl: avatar),
                    ),
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          style: TextStyle(
                            color: Theme.of(context).textTheme.headline1?.color,
                            fontSize: 16,
                            fontFamily: 'Roboto',
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 6),
                        if (subtitle != null)
                          Text(
                            subtitle ?? '',
                            style: TextStyle(
                              color: Theme.of(context)
                                  .textTheme
                                  .headline1
                                  ?.color!
                                  .withOpacity(0.35),
                              fontSize: 14,
                              fontFamily: 'Roboto',
                              fontWeight: FontWeight.w400,
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ));
  }
}
