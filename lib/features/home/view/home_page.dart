import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/core/dependency_injection/dependency_injection.dart';
import 'package:mobile_app/features/home/view/home_view.dart';
import 'package:mobile_app/features/transactions/transactions.dart';

class HomePage extends StatelessWidget {
  const HomePage({Key? key}) : super(key: key);

  /// Returns a [MaterialPageRoute] to navigate to `this` widget.
  static Route go() {
    return MaterialPageRoute<void>(builder: (_) => const HomePage());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        backgroundColor: Theme.of(context).backgroundColor,
        body: MultiBlocProvider(
          providers: [
            BlocProvider(
              create: (context) => SearchTransactionsBloc(
                transactionRepository: getIt<ITransactionsRepository>(),
              ),
            ),
          ],
          child: const HomeView(),
        ));
  }
}
