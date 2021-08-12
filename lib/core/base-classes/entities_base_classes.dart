import 'package:equatable/equatable.dart';

abstract class Entity with EquatableMixin {
  Entity(this.id);

  final String id;

  @override
  List<Object?> get props => [id];
}
