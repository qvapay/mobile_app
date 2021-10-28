import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';

import 'package:mobile_app/core/constants/widgets_constants.dart';
import 'package:mobile_app/core/widgets/transaction_card_widget.dart';
import 'package:mobile_app/core/widgets/user_service_card_widget.dart';
import 'package:mobile_app/features/home/widgets/home_header.dart';
import 'package:mobile_app/features/user_data/user_data.dart';

const Color bgColor = Color(0xffEBECEE);

class SaldoPage extends StatelessWidget {
  const SaldoPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Scaffold(
        bottomNavigationBar: const _BottomSendAndRecive(),
        backgroundColor: bgColor,
        body: Column(
          children: [
            Container(
              color: bgColor,
              child: const HomeHeader(),
            ),
            Expanded(
              child: Container(
                decoration: const BoxDecoration(
                  gradient: kLinearGradientBlackLight,
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
          backgroundColor: bgColor,
          appBar: PreferredSize(
            preferredSize: const Size.fromHeight(50),
            child: Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Container(
                color: bgColor,
                child: Stack(
                  children: [
                    TabBar(
                      isScrollable: true,
                      labelColor: Colors.blueAccent,
                      unselectedLabelColor: Colors.black.withOpacity(.9),
                      indicatorSize: TabBarIndicatorSize.label,
                      labelStyle: const TextStyle(
                          fontWeight: FontWeight.bold, fontSize: 16),
                      unselectedLabelStyle: const TextStyle(
                          color: Colors.black12, fontWeight: FontWeight.w600),
                      tabs: const [
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
                  const SizedBox(
                    height: 200,
                    child: Center(
                      child: Text(
                        'Servicios',
                        style: TextStyle(fontSize: 22),
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
                          horizontal: 16, vertical: 16),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Últimas Transacciones',
                              style: TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.black87)),
                          GestureDetector(
                            onTap: () {
                              debugPrint('Ir a todos');
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
                      child: Builder(builder: (context) {
                        final userTransactions = context.select(
                                (UserDataCubit cubit) =>
                                    cubit.state.userData?.latestTransactions) ??
                            [];
                        return ListView.builder(
                            itemCount: userTransactions.take(5).length,
                            itemBuilder: (context, index) {
                              final credit =
                                  double.parse(userTransactions[index].amount);
                              final date = DateFormat.yMd()
                                  .format(userTransactions[index].createdAt)
                                  .toString();
                              return TransactionCardWidget(
                                name: userTransactions[index].uuid,
                                avatar: userTransactions[index].logo,
                                credit: credit.abs(),
                                date: date,
                                isCredit: credit > 0,
                              );
                            });
                      }),
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

class _BottomSendAndRecive extends StatelessWidget {
  const _BottomSendAndRecive({
    Key? key,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 80,
      decoration: const BoxDecoration(
        gradient: kLinearGradientBlackLight,
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          GestureDetector(
            onTap: () {
              debugPrint('Enviar');
            },
            child: Row(
              children: const [
                Icon(
                  Icons.arrow_upward_sharp,
                  color: Colors.white70,
                  size: 24,
                ),
                SizedBox(
                  width: 5,
                ),
                Text(
                  'Enviar',
                  style: styleSendRec,
                ),
              ],
            ),
          ),
          const SizedBox(
            width: 45,
          ),
          GestureDetector(
            onTap: () {
              debugPrint('Recibir');
            },
            child: Row(
              children: const [
                Icon(
                  Icons.arrow_downward,
                  color: Colors.white70,
                  size: 24,
                ),
                SizedBox(
                  width: 5,
                ),
                Text(
                  'Recibir',
                  style: styleSendRec,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
