import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/core/widgets/widgets.dart';
import 'package:mobile_app/features/setting/theme/cubit/theme_cubit.dart';

/// ProfileImageNetworkWidget shows a network image using a caching mechanism.
///
/// The `imageUrl` dafault to `'https://qvapay.com/android-chrome-512x512.png'`.
///
/// A uniform `border` with all sides the same color and `width`.
/// The sides default to `white` solid borders, `four` logical pixel wide.
class ProfileImageNetworkWidget extends StatelessWidget {
  const ProfileImageNetworkWidget({
    Key? key,
    required this.imageUrl, //= qvapayIconUrl
    this.radius = 25.0,
    this.fix = BoxFit.cover,
    this.backgroundColor,
    this.borderImage,
  }) : super(key: key);

  final String imageUrl;
  final double radius;
  final BoxFit fix;
  final Color? backgroundColor;
  final Border? borderImage;

  @override
  Widget build(BuildContext context) {
    final maxRadius = radius * 2;
    final color = context.select((ThemeCubit cubit) => cubit.state)
        ? Colors.grey[600]
        : Colors.grey[200];
    return ClipRRect(
      borderRadius: BorderRadius.circular(maxRadius),
      child: Container(
        height: maxRadius,
        width: maxRadius,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(maxRadius),
          color: backgroundColor ?? color,
          border: borderImage,
        ),
        child: ClipRRect(
            borderRadius: BorderRadius.circular(maxRadius),
            child: AnimatedSwitcher(
              duration: const Duration(
                milliseconds: 300,
              ),
              child: imageUrl.contains('https://')
                  ? CachedNetworkImage(
                      imageUrl: imageUrl,
                      fit: fix,
                      height: maxRadius,
                      width: maxRadius,
                      placeholder: (context, url) =>
                          const CircularProgressIndicator(),
                      errorWidget: (context, url, dynamic error) =>
                          const Center(
                        child: UnknownCircleAvatarWidget(),
                      ),
                    )
                  : const UnknownCircleAvatarWidget(),
            )),
      ),
    );
  }
}
