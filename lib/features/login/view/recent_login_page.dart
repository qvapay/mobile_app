import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/authentication/authentication.dart';

import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/core/dependency_injection/dependency_injection.dart';
import 'package:mobile_app/features/login/login.dart';
import 'package:mobile_app/features/login/widgets/widgets.dart';

class RecentLoginPage extends StatelessWidget {
  const RecentLoginPage({Key? key}) : super(key: key);

  /// Returns a [MaterialPageRoute] to navigate to `this` widget.
  static Route go() {
    return MaterialPageRoute<void>(builder: (_) => const RecentLoginPage());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        body: BlocProvider(
      create: (context) => LoginBloc(
        authenticationRepository: getIt<IAuthenticationRepository>(),
      ),
      child: const RecentLoginView(),
    ));
  }
}

class RecentLoginView extends StatelessWidget {
  const RecentLoginView({
    Key? key,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Column(
      children: <Widget>[
        Expanded(
          child: SingleChildScrollView(
            physics: const BouncingScrollPhysics(),
            child: Column(
              children: [
                const HeaderRecentLogin(),
                const SizedBox(
                  height: 50,
                ),
                const Padding(
                  padding: EdgeInsets.all(20),
                  child: PasswordTextFielWidget(),
                ),
                const SizedBox(
                  height: 20,
                ),
                TextButton(
                    onPressed: () {
                      Navigator.of(context).pushAndRemoveUntil<void>(
                        LoginPage.go(),
                        (_) => false,
                      );
                    },
                    child: Text(
                      'Entrar con otra cuenta',
                      style: kTitleScaffold.copyWith(fontSize: 14),
                    ))
              ],
            ),
          ),
        ),
        const Padding(
          padding: EdgeInsets.all(8),
          child: LoginButtomSubmitted(),
        )
      ],
    );
  }
}
