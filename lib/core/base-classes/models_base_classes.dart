import 'package:mobile_app/core/base-classes/entities_base_classes.dart';

abstract class Model extends Entity {
  Model(String id) : super(id);
  Map<String, dynamic> toJson();
}
