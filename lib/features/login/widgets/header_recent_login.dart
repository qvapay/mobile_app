import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/core/themes/colors.dart';
import 'package:mobile_app/core/widgets/widgets.dart';
import 'package:mobile_app/features/login/login.dart';
import 'package:mobile_app/features/preferences/preferences.dart';
import 'package:mobile_app/features/setting/theme/cubit/theme_cubit.dart';

class HeaderRecentLogin extends StatelessWidget {
  const HeaderRecentLogin({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return BlocSelector<PreferencesBloc, PreferencesState, LastLogIn?>(
      selector: (state) {
        if (state is PreferencesRecentStart) {
          context
              .read<LoginBloc>()
              .add(LoginEmailChanged(state.lastLogIn.email));
          return state.lastLogIn;
        }
      },
      builder: (context, lastLogIn) {
        final isDark = context.select((ThemeCubit cubit) => cubit.state);
        return Container(
          height: size.height * 0.38,
          decoration: BoxDecoration(
            gradient: isDark
                ? AppColors.linearGradientBlackLight
                : AppColors.linearGradientBlue,
            borderRadius: const BorderRadius.only(
                bottomLeft: Radius.circular(50),
                bottomRight: Radius.circular(50)),
            boxShadow: isDark
                ? null
                : const [
                    BoxShadow(
                      color: Colors.grey,
                      blurRadius: 10,
                    )
                  ],
          ),
          child: Column(
            children: [
              const Spacer(),
              Expanded(
                flex: 4,
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(15),
                    child: ProfileImageNetworkWidget(
                      imageUrl: lastLogIn?.photoUrl ?? qvapayIconUrl,
                      radius: 60,
                      borderImage: Border.all(width: 4, color: Colors.white),
                    ),
                  ),
                ),
              ),
              if (lastLogIn != null)
                Text(
                  lastLogIn.name,
                  style: kNameLogin,
                ),
              const SizedBox(
                height: 5,
              ),
              if (lastLogIn != null)
                Expanded(
                    flex: 2,
                    child: Text(
                      lastLogIn.email,
                      style: kEmailLogin,
                    ))
            ],
          ),
        );
      },
    );
  }
}
