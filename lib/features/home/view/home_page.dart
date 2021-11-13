import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/core/dependency_injection/dependency_injection.dart';
import 'package:mobile_app/features/home/view/home_view.dart';
import 'package:mobile_app/features/transactions/search/bloc/search_transactions_bloc.dart';
import 'package:mobile_app/features/user_data/user_data.dart';

class HomePage extends StatelessWidget {
  const HomePage({Key? key}) : super(key: key);

  /// Returns a [MaterialPageRoute] to navigate to `this` widget.
  static Route go() {
    return MaterialPageRoute<void>(builder: (_) => const HomePage());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        body: MultiBlocProvider(
      providers: [
        BlocProvider(
          create: (context) => UserDataCubit(
            userDataRepository: getIt<IUserDataRepository>(),
          )..getUserData(saveDateLastLogIn: DateTime.now()),
        ),
        BlocProvider(
          create: (context) => SearchTransactionsBloc(),
        ),
      ],
      child: const HomeView(),
    ));
  }
}
