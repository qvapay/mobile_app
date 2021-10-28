import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';
import 'package:mobile_app/features/user_data/user_data.dart';

class HomeHeader extends StatelessWidget {
  const HomeHeader({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Container(
        width: double.maxFinite,
        height: 200,
        decoration: const BoxDecoration(
          gradient: kLinearGradientBlue,
          borderRadius: BorderRadius.only(
            bottomLeft: Radius.circular(40),
            bottomRight: Radius.circular(40),
          ),
        ),
        child: Stack(
          children: [
            Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Builder(builder: (context) {
                    final balance = context.select((UserDataCubit element) =>
                            element.state.userData?.balance) ??
                        '0.0';
                    return Text(
                      '\$ $balance',
                      style: styleNumber,
                    );
                  }),
                  const SizedBox(
                    height: 10,
                  ),
                  const Text(
                    'Administrar Saldo',
                    style: styleAdmin,
                  ),
                  const SizedBox(
                    height: 20,
                  )
                ],
              ),
            ),
            Positioned(
              top: 15,
              right: 10,
              child: GestureDetector(
                onTap: () {},
                child: Row(
                  children: [
                    Builder(builder: (context) {
                      final name = context.select((UserDataCubit element) =>
                              element.state.userData?.nameAndLastName) ??
                          'Uknow';
                      return Text(
                        name,
                        style: styleUser,
                      );
                    }),
                    const SizedBox(
                      width: 10,
                    ),
                    Builder(builder: (context) {
                      final photoUrl = context.select((UserDataCubit element) =>
                          element.state.userData?.logo);

                      return photoUrl == null || !photoUrl.contains('https://')
                          ? CircleAvatar(
                              backgroundColor: Colors.white,
                              radius: 25,
                              child: Image.asset(
                                'assets/images/no_image.png',
                                height: 35,
                              ))
                          : CircleAvatar(
                              backgroundColor: Colors.white,
                              radius: 25,
                              backgroundImage: NetworkImage(
                                photoUrl,
                              ),
                            );
                    }),
                  ],
                ),
              ),
            ),
            Positioned(
                top: 8,
                left: 10,
                child: IconButton(
                  icon: const Icon(
                    Icons.menu_open,
                    color: Colors.white,
                    size: 32,
                  ),
                  onPressed: () {},
                ))
          ],
        ));
  }
}
