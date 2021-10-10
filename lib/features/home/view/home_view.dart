import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/authentication/authentication.dart';

import 'package:mobile_app/features/home/home.dart';

class HomeView extends StatelessWidget {
  const HomeView({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text('Home Page'),
          BlocBuilder<HomeBloc, HomeState>(
            builder: (context, state) {
              if (state is HomeError) {
                return Text(state.message);
              }
              if (state is HomeLoaded) {
                return Text('User: ${state.userData.name}');
              }
              if (state is HomeLoading) {
                return const CircularProgressIndicator();
              }
              return const Text('User: empty');
            },
          ),
          ElevatedButton(
            onPressed: () {
              context.read<HomeBloc>().add(HomeGetUserData());
            },
            child: const Text('GetUserData'),
          ),
          ElevatedButton(
              onPressed: () {
                context
                    .read<AuthenticationBloc>()
                    .add(AuthenticationLogoutRequested());
              },
              child: const Text('LogOut'))
        ],
      ),
    );
  }
}
