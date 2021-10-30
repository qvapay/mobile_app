import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';
import 'package:mobile_app/features/login/login.dart';
import 'package:mobile_app/features/preferences/preferences.dart';

class HeaderRecentLogin extends StatelessWidget {
  const HeaderRecentLogin({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
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
        return Container(
          height: 320,
          decoration: const BoxDecoration(
              gradient: kLinearGradientBlue,
              borderRadius: BorderRadius.only(
                  bottomLeft: Radius.circular(50),
                  bottomRight: Radius.circular(50)),
              boxShadow: [
                BoxShadow(
                  color: Colors.grey,
                  blurRadius: 10,
                )
              ]),
          child: Column(
            children: [
              const Spacer(),
              Expanded(
                flex: 4,
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(15),
                    child: lastLogIn == null
                        ? CircleAvatar(
                            backgroundColor: Colors.white,
                            radius: 60,
                            child: Image.asset(
                              'assets/images/no_image.png',
                              height: 70,
                            ))
                        : CircleAvatar(
                            backgroundColor: Colors.white,
                            radius: 60,
                            backgroundImage: NetworkImage(
                              lastLogIn.photoUrl,
                            ),
                          ),
                  ),
                ),
              ),
              if (lastLogIn == null)
                const Text(
                  'Erich Garcia Cruz',
                  style: kNameLogin,
                ),
              if (lastLogIn != null)
                Text(
                  lastLogIn.name,
                  style: kNameLogin,
                ),
              const SizedBox(
                height: 5,
              ),
              if (lastLogIn == null)
                const Expanded(
                    flex: 2,
                    child: Text(
                      'ecruz@qvapay.com',
                      style: kEmailLogin,
                    )),
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
