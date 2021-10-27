import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';
import 'package:mobile_app/core/widgets/header_transactions.dart';
import 'package:mobile_app/core/widgets/list_tile_card_widget.dart';

const Color bgColor = Color(0xffEBECEE);

class SaldoPage extends StatefulWidget {
  const SaldoPage({Key? key}) : super(key: key);

  @override
  _SaldoPageState createState() => _SaldoPageState();
}

class _SaldoPageState extends State<SaldoPage> {
  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Scaffold(
        bottomNavigationBar: const _bottomNav(),
        backgroundColor: bgColor,
        body: Column(
          children: [
            Container(
              color: bgColor,
              child: const HeaderTransactions(
                saldo: '29.64',
              ),
            ),
            Expanded(
              child: Container(
                decoration: const BoxDecoration(
                  gradient: kLinearGradientBlackLight,
                ),
                child: Container(
                  decoration: const BoxDecoration(
                      //color: Colors.greenAccent,
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

  @override
  void initState() {
    super.initState();
  }

  @override
  void dispose() {
    super.dispose();
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
              child: AppBar(
                backgroundColor: bgColor,
                elevation: 0,
                flexibleSpace: Stack(
                  children: [
                    TabBar(
                      isScrollable: true,
                      // indicatorWeight: 0.01,
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
          body: TabBarView(children: [
            Column(
              children: [
                Container(
                  margin: const EdgeInsets.symmetric(vertical: 10),
                  padding: const EdgeInsets.all(10),
                  height: 100,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: const <Widget>[
                      ListTileCard(
                        name: 'Martin Ekstrom',
                        avatar: 'assets/avatars/keanu.png',
                        credit: '',
                        date: '',
                        subtexto: '',
                        user: true,
                      ),
                      ListTileCard(
                        name: 'Martin Ekstrom',
                        avatar: 'assets/avatars/keanu.png',
                        credit: '',
                        date: '',
                        subtexto: '',
                        user: true,
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 20, vertical: 5),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Ultimas Transacciones',
                                style: TextStyle(
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
                        child: Container(
                          margin: const EdgeInsets.symmetric(vertical: 10),
                          child: ListView(
                            // scrollDirection: Axis.vertical,
                            children: const [
                              ListTileCard(
                                name: 'Martin Ekstrom Bothman',
                                avatar: 'assets/avatars/keanu.png',
                                credit: '+\$542.33',
                                date: '05/06/2021',
                                subtexto: 'Crédito',
                                user: false,
                              ),
                              ListTileCard(
                                name: 'Randy Shleifer',
                                avatar: 'assets/avatars/eric.png',
                                credit: '-\$542.33',
                                date: '05/06/2021',
                                subtexto: 'Crédito',
                                user: false,
                              ),
                              ListTileCard(
                                name: 'Emerson Franci',
                                avatar: 'assets/avatars/keanu.png',
                                credit: '-\$542.33',
                                date: '05/06/2021',
                                subtexto: 'Crédito',
                                user: false,
                              ),
                            ],
                          ),
                        ),
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
                  'Tab 2',
                  style: TextStyle(fontSize: 30, fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class _bottomNav extends StatelessWidget {
  const _bottomNav({
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
              print('Enviar');
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
            width: 30,
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
