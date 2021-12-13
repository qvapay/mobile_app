import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';
import 'package:mobile_app/core/widgets/widgets.dart';
import 'package:mobile_app/features/authentication/authentication.dart';
import 'package:mobile_app/features/login/login.dart';
import 'package:mobile_app/features/preferences/preferences.dart';
import 'package:mobile_app/features/setting/theme/theme.dart';
import 'package:mobile_app/features/start/start.dart';
import 'package:mobile_app/features/user_data/user_data.dart';

class HomeHeader extends StatelessWidget {
  const HomeHeader({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Container(
        width: double.maxFinite,
        height: MediaQuery.of(context).size.height * 0.25,
        decoration: context.select((ThemeCubit cubit) => cubit.state)
            ? BoxDecoration(
                color: Theme.of(context).cardColor,
                borderRadius: const BorderRadius.only(
                  bottomLeft: Radius.circular(40),
                  bottomRight: Radius.circular(40),
                ),
              )
            : const BoxDecoration(
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
                  BlocBuilder<UserDataCubit, UserDataState>(
                      builder: (context, state) {
                    return AnimatedSwitcher(
                      duration: const Duration(milliseconds: 300),
                      child: state.userData != null
                          ? Text(
                              '\$ ${state.userData?.balance ?? '0.0'}',
                              style: styleNumber,
                            )
                          : const Text(r'$ 0.0', style: styleNumber),
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
                    BlocBuilder<UserDataCubit, UserDataState>(
                        builder: (context, state) {
                      return AnimatedSwitcher(
                        duration: const Duration(milliseconds: 300),
                        child: state.userData != null
                            ? Row(
                                children: [
                                  Text(
                                    state.userData!.nameAndLastName,
                                    style: styleUser,
                                  ),
                                  const SizedBox(
                                    width: 10,
                                  ),
                                  ProfileImageNetworkWidget(
                                    imageUrl: state.userData!.logo,
                                    borderImage: Border.all(
                                        width: 4, color: Colors.white),
                                  ),
                                ],
                              )
                            : Row(
                                children: const [
                                  Text(
                                    '',
                                    style: styleUser,
                                  ),
                                  SizedBox(
                                    width: 10,
                                  ),
                                  UnknownCircleAvatarWidget(),
                                ],
                              ),
                      );
                    }),
                    const SizedBox(
                      width: 10,
                    ),
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
                  onPressed: () {
                    context
                        .read<AuthenticationBloc>()
                        .add(AuthenticationLogoutRequested());
                    context.read<PreferencesBloc>().add(CleanPreferences());
                  },
                ))
          ],
        ));
  }
}
