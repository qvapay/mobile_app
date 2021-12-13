import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/core/themes/themes.dart';
import 'package:mobile_app/core/widgets/widgets.dart';
import 'package:mobile_app/features/home/widgets/widgets.dart';
import 'package:mobile_app/features/transactions/transactions.dart';
import 'package:mobile_app/features/user_data/user_data.dart';

class HomeView extends StatelessWidget {
  const HomeView({Key? key}) : super(key: key);
  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Scaffold(
        bottomNavigationBar: const BottomSendAndReciveWidget(),
        backgroundColor: Theme.of(context).backgroundColor,
        body: BlocListener<UserDataCubit, UserDataState>(
          listenWhen: (previous, current) =>
              previous.errorMessage != current.errorMessage,
          listener: (context, state) {
            if (state.errorMessage != null) {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                content: Text('Error al comunicarse con el servidor !!'),
              ));
            }
          },
          child: Column(
            children: [
              Container(
                color: Theme.of(context).backgroundColor,
                child: const HomeHeader(),
              ),
              Expanded(
                child: Container(
                  decoration: const BoxDecoration(
                    gradient: AppColors.linearGradientBlackLight,
                  ),
                  child: Container(
                    decoration: const BoxDecoration(
                        borderRadius: BorderRadius.only(
                            bottomRight: Radius.circular(30),
                            bottomLeft: Radius.circular(30))),
                    child: const _TabUser(),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TabUser extends StatelessWidget {
  const _TabUser({
    Key? key,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: const BorderRadius.only(
          bottomLeft: Radius.circular(30), bottomRight: Radius.circular(30)),
      child: DefaultTabController(
        length: 2,
        child: Scaffold(
          backgroundColor: Theme.of(context).backgroundColor,
          appBar: PreferredSize(
            preferredSize: const Size.fromHeight(50),
            child: Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Container(
                color: Theme.of(context).backgroundColor,
                child: Stack(
                  children: [
                    const TabBar(
                      isScrollable: true,
                      indicatorSize: TabBarIndicatorSize.label,
                      labelStyle:
                          TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                      unselectedLabelStyle: TextStyle(
                          color: Colors.black12, fontWeight: FontWeight.w600),
                      tabs: [
                        Tab(
                          text: 'Usuarios',
                        ),
                        Tab(
                          text: 'Servicios',
                        ),
                      ],
                    ),
                    Positioned(
                      top: 10,
                      right: 20,
                      child: GestureDetector(
                        onTap: () {
                          debugPrint('Ir a todos');
                        },
                        child: Row(
                          children: const [
                            Text(
                              'Todos',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: AppColors.textBlue,
                              ),
                            ),
                            SizedBox(
                              width: 5,
                            ),
                            Icon(
                              Icons.arrow_forward_ios_sharp,
                              size: 16,
                              color: AppColors.textBlue,
                            )
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          body: Column(
            children: [
              SizedBox(
                height: 115,
                child: TabBarView(children: [
                  Column(
                    children: [
                      Container(
                        margin: const EdgeInsets.symmetric(vertical: 6),
                        padding: const EdgeInsets.symmetric(horizontal: 6),
                        height: 100,
                        child: ListView(
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          scrollDirection: Axis.horizontal,
                          children: const <Widget>[
                            UserServiceCardWidget(
                              name: 'Martin Ekstrom',
                              avatar: 'assets/avatars/keanu.png',
                            ),
                            UserServiceCardWidget(
                              name: 'Martin Ekstrom',
                              avatar: 'assets/avatars/keanu.png',
                            ),
                            UserServiceCardWidget(
                              name: 'Martin Ekstrom',
                              avatar: 'assets/avatars/keanu.png',
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  SizedBox(
                    height: 200,
                    child: Center(
                      child: Text(
                        'Servicios',
                        style: TextStyle(
                          fontSize: 22,
                          color: Theme.of(context).textTheme.headline1?.color,
                        ),
                      ),
                    ),
                  ),
                ]),
              ),
              Expanded(
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 8),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Últimas Transacciones',
                              style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w900,
                                  color: Theme.of(context)
                                      .textTheme
                                      .headline1
                                      ?.color)),
                          GestureDetector(
                            onTap: () {
                              Navigator.push<void>(
                                context,
                                MaterialPageRoute<void>(
                                  builder: (_) => BlocProvider.value(
                                    value:
                                        context.read<SearchTransactionsBloc>()
                                          ..add(const GetAllTransactions()),
                                    child: const SearchTransactionPage(),
                                  ),
                                ),
                              );
                            },
                            child: Row(
                              children: const [
                                Text(
                                  'Todas',
                                  style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                      color: Colors.blue),
                                ),
                                SizedBox(
                                  width: 5,
                                ),
                                Icon(Icons.arrow_forward_ios_sharp,
                                    size: 16, color: Colors.blue)
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: BlocBuilder<UserDataCubit, UserDataState>(
                        builder: (context, state) {
                          if (state.isStateLoading) {
                            return Center(
                              child: CircularProgressIndicator(
                                color: Theme.of(context).primaryColor,
                              ),
                            );
                          }
                          if (state.userData != null) {
                            if (state.userData!.latestTransactions.isNotEmpty) {
                              return ListView.builder(
                                  itemCount: state.userData!.latestTransactions
                                      .take(5)
                                      .length,
                                  itemBuilder: (context, index) {
                                    final transaction = state
                                        .userData!.latestTransactions[index];
                                    return TransactionCardWidget(
                                      transaction: transaction,
                                    );
                                  });
                            }
                            return const Center(
                              child: Text('0 Transacciones'),
                            );
                          }
                          return const Center(
                            child: Text('0 Transacciones'),
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
