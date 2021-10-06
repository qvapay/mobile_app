// Copyright (c) 2021, Very Good Ventures
// https://verygood.ventures
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/authentication/bloc/authentication_bloc.dart';
import 'package:mobile_app/authentication/repository/authentication_repository.dart';
import 'package:mobile_app/core/dependency_injection/dependency_injection.dart';
import 'package:mobile_app/preferences/bloc/preferences_bloc.dart';
import 'package:mobile_app/preferences/repository/preferences_repository.dart';

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
          ),
        ),
        BlocProvider<AuthenticationBloc>(
          create: (BuildContext context) => AuthenticationBloc(
            authenticationRepository: getIt<IAuthenticationRepository>(),
          ),
        ),
      ],
      child: AppView(),
    );
  }
}

class AppView extends StatelessWidget {
  AppView({Key? key}) : super(key: key);
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
      home: MultiBlocListener(
        listeners: [
          BlocListener<PreferencesBloc, PreferencesState>(
            listener: (context, state) {},
          ),
          BlocListener<AuthenticationBloc, AuthenticationState>(
            listener: (context, state) {},
          ),
        ],
      ),
    );
  }
}
