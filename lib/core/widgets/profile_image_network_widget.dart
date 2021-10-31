import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/constants.dart';

/// ProfileImageNetworkWidget shows a network image using a caching mechanism.
///
/// The `imageUrl` dafault to `'https://qvapay.com/android-chrome-512x512.png'`.
///
/// A uniform `border` with all sides the same color and `width`.
/// The sides default to `white` solid borders, `four` logical pixel wide.
class ProfileImageNetworkWidget extends StatelessWidget {
  const ProfileImageNetworkWidget({
    Key? key,
    required this.imageUrl,
    this.radius = 25.0,
    this.fix = BoxFit.cover,
    this.backgroundColor,
    this.borderImage,
  }) : super(key: key);

  final String? imageUrl;
  final double radius;
  final BoxFit fix;
  final Color? backgroundColor;
  final Border? borderImage;

  @override
  Widget build(BuildContext context) {
    final maxRadius = radius * 2;
    return ClipRRect(
      borderRadius: BorderRadius.circular(maxRadius),
      child: Container(
        height: maxRadius,
        width: maxRadius,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(maxRadius),
          color: backgroundColor ?? Colors.grey[200],
          border: borderImage,
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(maxRadius),
          child: CachedNetworkImage(
            imageUrl: imageUrl ?? qvapayIconUrl,
            fit: fix,
            height: maxRadius,
            width: maxRadius,
            placeholder: (context, url) => const CircularProgressIndicator(),
            errorWidget: (context, url, dynamic error) => Center(
              child: CircleAvatar(
                backgroundColor: backgroundColor ?? Colors.grey[200],
                child: Padding(
                  padding: const EdgeInsets.all(6),
                  child: Image.asset(
                    'assets/images/no_image.png',
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
