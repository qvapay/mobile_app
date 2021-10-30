// Copyright (c) 2021, Very Good Ventures
// https://verygood.ventures
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/core/dependency_injection/dependency_injection.dart';
import 'package:mobile_app/features/authentication/authentication.dart';
import 'package:mobile_app/features/home/home.dart';
import 'package:mobile_app/features/login/login.dart';
import 'package:mobile_app/features/preferences/preferences.dart';
import 'package:mobile_app/features/start/start.dart';
import 'package:qvapay_api_client/qvapay_api_client.dart';

class App extends StatelessWidget {
  const App({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider<PreferencesBloc>(
          lazy: false,
          create: (BuildContext context) => PreferencesBloc(
            preferencesRepository: getIt<PreferencesRepository>(),
          )..add(GetPreferences()),
        ),
        BlocProvider<AuthenticationBloc>(
          create: (BuildContext context) => AuthenticationBloc(
            authenticationRepository: getIt<IAuthenticationRepository>(),
          ),
        ),
      ],
      child: const AppView(),
    );
  }
}

class AppView extends StatefulWidget {
  const AppView({Key? key}) : super(key: key);

  @override
  State<AppView> createState() => _AppViewState();
}

class _AppViewState extends State<AppView> {
  final _navigatorKey = GlobalKey<NavigatorState>();

  NavigatorState get _navigator => _navigatorKey.currentState!;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: _navigatorKey,
      theme: ThemeData(
        appBarTheme: const AppBarTheme(color: Color(0xFF13B9FF)),
        colorScheme: ColorScheme.fromSwatch(
          accentColor: const Color(0xFF13B9FF),
        ),
      ),
      builder: (context, child) {
        return MultiBlocListener(
          listeners: [
            BlocListener<PreferencesBloc, PreferencesState>(
              listener: (context, state) {
                if (state is PreferencesFristTime) {
                  _navigator.pushAndRemoveUntil<void>(
                    StartPage.go(),
                    (route) => false,
                  );
                } else if (state is PreferencesRecentStart) {
                  _navigator.pushAndRemoveUntil<void>(
                    RecentLoginPage.go(),
                    (route) => false,
                  );
                } else if (state is PreferencesVeryRecentStart) {
                  _navigator.pushAndRemoveUntil<void>(
                    HomePage.go(),
                    (route) => false,
                  );
                } else if (state is PreferencesNotRecentStart) {
                  _navigator.pushAndRemoveUntil<void>(
                    LoginPage.go(),
                    (route) => false,
                  );
                }
              },
            ),
            BlocListener<AuthenticationBloc, AuthenticationState>(
                listener: (context, state) {
              switch (state.status) {
                case OAuthStatus.authenticated:
                  _navigator.pushAndRemoveUntil<void>(
                    HomePage.go(),
                    (route) => false,
                  );
                  break;
                case OAuthStatus.unauthenticated:
                  _navigator.pushAndRemoveUntil<void>(
                    LoginPage.go(),
                    (route) => false,
                  );
                  break;
                default:
                  break;
              }
            }),
          ],
          child: child!,
        );
      },
      onGenerateRoute: (_) => SplashScreenPage.go(),
    );
  }
}
